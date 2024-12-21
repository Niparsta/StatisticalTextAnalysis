import chardet
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pymorphy3
import re
from collections import Counter
from typing import List, Dict
import os
import shutil
import tempfile
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
import fitz

morph = pymorphy3.MorphAnalyzer()

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

UPLOAD_DIR = "uploads"

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

STOPWORDS = [
    "а", "вы", "которые", "мою", "но", "свои", "то", "будем", "да", "который", "моя", "о", "своиим", "тобой",
    "будет", "для", "кто", "мы", "об", "своиими", "тобою", "будешь", "до", "меня", "на", "один", "своиих", "того",
    "буду", "его", "мне", "нам", "одна", "свой", "той", "будут", "ее", "мной", "нами", "одни", "свою", "только",
    "будь", "ей", "мною", "нас", "одним", "своя", "том", "будьте", "ему", "мог", "наш", "одними", "себе", "тому",
    "бы", "если", "моги", "наша", "одних", "себя", "тот", "был", "есть", "могите", "наше", "одно", "собой", "ту",
    "была", "еще", "могла", "нашего", "одного", "собою", "ты", "были", "ею", "могли", "нашей", "одной", "та", "у",
    "было", "же", "могло", "нашем", "одном", "так", "уже", "быть", "за", "могу", "нашему", "одному", "такая", "чего",
    "в", "и", "могут", "нашею", "одною", "такие", "чем", "вам", "из", "мое", "наши", "одну", "таким", "чему", "вами",
    "или", "моего", "нашим", "он", "такими", "что", "вас", "им", "моей", "нашими", "она", "таких", "чтобы", "весь",
    "ими", "моем", "наших", "они", "такого", "эта", "во", "их", "моему", "нашу", "оно", "такое", "эти", "вот", "к",
    "моею", "не", "от", "такой", "этим", "все", "как", "можем", "него", "по", "таком", "этими", "всего", "кем",
    "может", "нее", "при", "такому", "этих", "всей", "ко", "можете", "ней", "с", "такою", "это", "всем", "когда",
    "можешь", "нем", "сам", "такую", "этого", "всеми", "кому", "моими", "нею", "своей", "тебе", "этом", "всему",
    "всех", "всею", "которая", "моих", "ним", "своем", "тем", "этот", "всю", "которое", "мой", "ними", "своему",
    "теми", "эту", "вся", "которую", "мочь", "них", "своею", "тех", "я", "a", "be", "i", "on", "to", "about", "but",
    "if", "one", "was", "all", "by", "in", "or", "we", "an", "can", "is", "so", "what", "and", "do", "it", "that",
    "which", "any", "for", "my", "the", "will", "are", "from", "no", "ther", "with", "as", "have", "not", "they",
    "would", "at", "her", "of", "this", "you"
]

class TextRequest(BaseModel):
    text: str

def normalize_text(text: str) -> List[str]:
    words = re.findall(r'\b\w+\b', text.lower())
    lemmatized_words = [morph.parse(word)[0].normal_form for word in words if
                        word not in STOPWORDS and not word.isdigit()]
    return lemmatized_words

async def perform_analysis(text: str) -> Dict:
    if not text.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")
    lemmatized_words = normalize_text(text)
    word_count = len(lemmatized_words)
    unique_words_count = len(set(lemmatized_words))
    sentences = len(re.findall(r'[.!?]', text))

    word_frequencies = Counter(lemmatized_words)
    total_words = sum(word_frequencies.values())

    word_data = [
        {"word": word, "count": count, "frequency": count / total_words}
        for word, count in word_frequencies.items()
    ]

    stopwords = [word for word in re.findall(r'\b\w+\b', text.lower()) if word in STOPWORDS]
    stopword_count = len(stopwords)
    stopword_frequencies = Counter(stopwords)
    total_stopwords = sum(stopword_frequencies.values())

    stopword_data = [
        {"word": word, "count": count, "frequency": count / total_stopwords}
        for word, count in stopword_frequencies.items()
    ]

    water_percentage = (stopword_count / word_count) if word_count > 0 else 0

    return {
        "characters": len(text),
        "characters_no_spaces": len(text.replace(" ", "")),
        "words": word_count,
        "unique_words_count": unique_words_count,
        "sentences": sentences,
        "unique_words": word_data,
        "stopwords_count": stopword_count,
        "stopwords": stopword_data,
        "water_percentage": water_percentage
    }

@app.post("/analyze")
async def analyze_text(request: TextRequest):
    return await perform_analysis(request.text)

def extract_text_from_pdf(file_path: str) -> str:
    text = ""
    try:
        pdf_document = fitz.open(file_path)
        for page_num in range(pdf_document.page_count):
            page = pdf_document[page_num]
            text += page.get_text()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка обработки файла формата PDF: {e}")
    return text

def extract_text_from_epub(file_path: str) -> str:
    text = ""
    try:
        book = epub.read_epub(file_path)
        for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
            soup = BeautifulSoup(item.content, 'html.parser')
            text += soup.get_text()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка обработки файла формата EPUB: {e}")
    return text

def extract_text_from_fb2(file_path: str) -> str:
    text = ""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f, 'xml')
            for body in soup.find_all('body'):
                text += body.get_text()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка обработки файла формата FB2: {e}")
    return text

@app.post("/analyze_file")
async def analyze_file(file: UploadFile = File(...)):
    file_extension = os.path.splitext(file.filename)[1].lower()

    with tempfile.NamedTemporaryFile(delete=False, dir=UPLOAD_DIR, suffix=file_extension) as temp_file:
        try:
            shutil.copyfileobj(file.file, temp_file)
            temp_file_path = temp_file.name
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка сохранения файла: {e}")
        finally:
            file.file.close()

    try:
        if file_extension == ".pdf":
            extracted_text = extract_text_from_pdf(temp_file_path)
        elif file_extension == ".epub":
            extracted_text = extract_text_from_epub(temp_file_path)
        elif file_extension == ".fb2":
            extracted_text = extract_text_from_fb2(temp_file_path)
        elif file_extension == ".txt":
            with open(temp_file_path, "rb") as f:
                raw_data = f.read()
                detected_encoding = chardet.detect(raw_data)["encoding"]

            if detected_encoding.lower() != "utf-8":
                raise HTTPException(
                    status_code=400, detail=f"Неподдерживаемая кодировка текстового файла: {detected_encoding}. Поддерживается только кодировка UTF-8."
                )

            with open(temp_file_path, "r", encoding="utf-8") as f:
                extracted_text = f.read()
        else:
            raise HTTPException(status_code=400, detail="Неподдерживаемый тип файла.")
        analysis_result = await perform_analysis(extracted_text)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки файла: {e}")
    finally:
        os.remove(temp_file_path)

    return analysis_result

@app.get("/", response_class=HTMLResponse)
async def get_index():
    return FileResponse("static/index.html")