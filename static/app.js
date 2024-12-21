const app = Vue.createApp({
    data() {
        return {
            text: "",
            analysis: null,
            errorMessage: "",
            isAnalyzingText: false,
            isAnalyzingFile: false,
        };
    },
    computed: {
        isLoading() {
            return this.isAnalyzingText || this.isAnalyzingFile;
        },
    },
    methods: {
    async analyzeText() {
        if (this.isLoading) {
            return;
        }
        this.isAnalyzingText = true;
        this.errorMessage = "";
        try {
            const response = await fetch("/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: this.text }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Произошла ошибка при анализе текста.");
            }

            this.analysis = await response.json();
        } catch (error) {
            if (error.name === "TypeError" && error.message.includes("fetch")) {
                this.errorMessage = "Сетевая ошибка: не удается подключиться к серверу.";
            } else {
                this.errorMessage = error.message;
            }
        } finally {
            this.isAnalyzingText = false;
        }
    },

    analyzeFile() {
        if (this.isLoading) return;
        document.getElementById("fileInput").click();
    },

    async handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) {
            this.errorMessage = "Пожалуйста, выберите файл для анализа.";
            return;
        }

        this.errorMessage = "";
        this.isAnalyzingFile = true;
        const formData = new FormData();
        formData.append("file", file);
        try {
            const response = await fetch("/analyze_file", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Ошибка при анализе файла.");
            }
            this.analysis = await response.json();
        } catch (error) {
            if (error.name === "TypeError" && error.message.includes("fetch")) {
                this.errorMessage = "Сетевая ошибка: не удается подключиться к серверу.";
            } else {
                this.errorMessage = error.message;
            }
        } finally {
            this.isAnalyzingFile = false;
        }
    },
},
    template: `
    <div style="overflow-y: auto; position: fixed; top: 0; left: 0; width: 100%; height: 100%; padding: 20px; box-sizing: border-box;">
      <h1>Статистический анализ больших текстов</h1>
      <textarea v-model="text" placeholder="Введите текст для анализа"
          style="width: calc(100% - 20px); min-height: 150px; height: auto; resize: none; overflow-y: auto;"></textarea>
      <div style="display: flex; align-items: center;">
        <button @click="analyzeText"
            style="margin-right: 10px;"
            :class="{'loading-button': isAnalyzingText, 'disabled-button': isLoading}">
              Анализировать текст
              <span v-if="isAnalyzingText">⏳</span>
        </button>
        <input type="file" id="fileInput" @change="handleFileSelection" style="display: none;" accept=".txt,.pdf,.epub,.fb2">
        <button @click="analyzeFile"
                 style="background-color: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px;"
                :class="{'loading-button': isAnalyzingFile, 'disabled-button': isLoading}">
          Проанализировать файл
          <span v-if="isAnalyzingFile">⏳</span>
        </button>

      </div>
      <p class="error" v-if="errorMessage">{{ errorMessage }}</p>

      <result-stats v-if="analysis" :analysis="analysis"></result-stats>
      <result-table v-if="analysis && analysis.unique_words.length > 0"
                    :uniqueWords="analysis.unique_words"
                    :stopwords="analysis.stopwords"
                    ></result-table>
    </div>
  `,
});

app.component("result-stats", {
    props: ["analysis"],
    data() {
        return {
            characterChart: null,
            wordChart: null,
            waterChart: null,
        };
    },
    watch: {
        analysis: {
            deep: true,
            immediate: true,
            handler(newAnalysis) {
                if (newAnalysis) {
                    this.$nextTick(() => this.updateCharts());
                }
            },
        },
    },
    methods: {
        updateCharts() {
            this.renderCharacterChart();
            this.renderWordChart();
            this.renderWaterChart();
        },
        renderCharacterChart() {
            const ctx = document.getElementById("characterChart");
            if (!ctx) return;
            if (this.characterChart) {
                this.characterChart.destroy();
            }
            this.characterChart = new Chart(ctx, {
                type: "pie",
                data: {
                    labels: ["Символы без пробелов", "Пробелы"],
                    datasets: [
                        {
                            data: [
                                this.analysis.characters_no_spaces,
                                this.analysis.characters - this.analysis.characters_no_spaces,
                            ],
                            backgroundColor: ["rgb(54, 162, 235)", "rgb(255, 99, 132)"],
                            hoverOffset: 4,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                },
            });
        },
        renderWordChart() {
            const ctx = document.getElementById("wordChart");
            if (!ctx) return;
            if (this.wordChart) {
                this.wordChart.destroy();
            }
            this.wordChart = new Chart(ctx, {
                type: "pie",
                data: {
                    labels: ["Уникальные слова", "Неуникальные слова"],
                    datasets: [
                        {
                            data: [
                                this.analysis.unique_words_count,
                                this.analysis.words - this.analysis.unique_words_count,
                            ],
                            backgroundColor: ["rgb(75, 192, 192)", "rgb(255, 205, 86)"],
                            hoverOffset: 4,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                },
            });
        },
        renderWaterChart() {
            const ctx = document.getElementById("waterChart");
            if (!ctx) return;
            if (this.waterChart) {
                this.waterChart.destroy();
            }
            const waterPercentage = (this.analysis.water_percentage * 100).toFixed(2);
            const contentPercentage = (100 - waterPercentage).toFixed(2);
            this.waterChart = new Chart(ctx, {
                type: "pie",
                data: {
                    labels: ["Вода", "Полезное содержание"],
                    datasets: [
                        {
                            data: [waterPercentage, contentPercentage],
                            backgroundColor: ["rgb(255, 159, 64)", "rgb(153, 102, 255)"],
                            hoverOffset: 4,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let label = context.label || "";
                                    if (label) {
                                        label += ": ";
                                    }
                                    if (context.parsed !== null) {
                                        label += context.parsed + "%";
                                    }
                                    return label;
                                },
                            },
                        },
                    },
                },
            });
        },
    },
    template: `
    <div v-if="analysis">
      <h2>Статистика текста:</h2>
      <div style="display: flex; flex-wrap: wrap; align-items: flex-start;">
        <div style="flex: 1; min-width: 200px;">
          <ul>
            <li>Количество символов: {{ analysis.characters }}</li>
            <li>Количество символов без пробелов: {{ analysis.characters_no_spaces }}</li>
            <li>Количество слов: {{ analysis.words }}</li>
            <li>Количество уникальных слов: {{ analysis.unique_words_count }}</li>
            <li>Количество предложений: {{ analysis.sentences }}</li>
            <li>Вода: {{ (analysis.water_percentage * 100).toFixed(2) }}%</li>
          </ul>
        </div>
        <div style="flex: 1; min-width: 150px; max-height: 200px;" v-if="analysis">
          <canvas id="characterChart"></canvas>
        </div>
        <div style="flex: 1; min-width: 150px; max-height: 200px;" v-if="analysis">
          <canvas id="wordChart"></canvas>
        </div>
        <div style="flex: 1; min-width: 150px; max-height: 200px;" v-if="analysis">
          <canvas id="waterChart"></canvas>
        </div>
      </div>
    </div>
  `,
});

app.component("result-table", {
    props: ["uniqueWords", "stopwords"],
    data() {
        return {
            sortColumnUniqueWords: 'count',
            sortDirectionUniqueWords: 'desc',
            sortColumnStopwords: 'count',
            sortDirectionStopwords: 'desc',
        };
    },
    computed: {
        sortedUniqueWords() {
            if (!this.uniqueWords) {
                return [];
            }
            return [...this.uniqueWords].sort((a, b) => {
                if (this.sortColumnUniqueWords === 'word') {
                    return a.word.localeCompare(b.word);
                }
                const aValue = this.sortColumnUniqueWords === 'count' ? a.count : a.frequency;
                const bValue = this.sortColumnUniqueWords === 'count' ? b.count : b.frequency;

                if (this.sortDirectionUniqueWords === 'asc') {
                    return this.compareValues(aValue, bValue);
                } else {
                    return this.compareValues(bValue, aValue);
                }
            });
        },
        sortedStopwords() {
            if (!this.stopwords || !this.stopwords.length) {
                return [];
            }
            return [...this.stopwords].sort((a, b) => {
                if (this.sortColumnStopwords === 'word') {
                    return a.word.localeCompare(b.word);
                }
                const aValue = this.sortColumnStopwords === 'count' ? a.count : a.frequency;
                const bValue = this.sortColumnStopwords === 'count' ? b.count : b.frequency;

                if (this.sortDirectionStopwords === 'asc') {
                    return this.compareValues(aValue, bValue);
                } else {
                    return this.compareValues(bValue, aValue);
                }
            });
        },
        sortIconUniqueWords() {
            return this.sortDirectionUniqueWords === 'desc' ? '↓' : '↑';
        },
        sortIconStopwords() {
            return this.sortDirectionStopwords === 'desc' ? '↓' : '↑';
        },
    },
    methods: {
        compareValues(a, b) {
            if (typeof a === "string") {
                return a.localeCompare(b);
            }
            return a - b;
        },
        sortTableUniqueWords(column) {
            if (column === 'word') {
                return;
            }
            if (this.sortColumnUniqueWords === column) {
                this.sortDirectionUniqueWords = this.sortDirectionUniqueWords === 'desc' ? 'asc' : 'desc';
            } else {
                this.sortColumnUniqueWords = column;
                this.sortDirectionUniqueWords = 'desc';
            }
        },
        sortTableStopwords(column) {
            if (column === 'word') {
                return;
            }
            if (this.sortColumnStopwords === column) {
                this.sortDirectionStopwords = this.sortDirectionStopwords === 'desc' ? 'asc' : 'desc';
            } else {
                this.sortColumnStopwords = column;
                this.sortDirectionStopwords = 'desc';
            }
        },
    },
    template: `
    <div>
      <h2>Уникальные слова:</h2>
      <table v-if="uniqueWords && uniqueWords.length">
        <thead>
          <tr>
            <th @click="sortTableUniqueWords('word')" style="cursor: pointer;">
              Слово
            </th>
            <th @click="sortTableUniqueWords('count')" style="cursor: pointer;">
              Количество
              <span v-if="sortColumnUniqueWords === 'count'">{{ sortIconUniqueWords }}</span>
            </th>
            <th @click="sortTableUniqueWords('frequency')" style="cursor: pointer;">
              Частота
               <span v-if="sortColumnUniqueWords === 'frequency'">{{ sortIconUniqueWords }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="word in sortedUniqueWords" :key="word.word">
            <td>{{ word.word }}</td>
            <td>{{ word.count }}</td>
            <td>{{ (word.frequency * 100).toFixed(4) }}%</td>
          </tr>
        </tbody>
      </table>
      <p v-else>Нет данных для отображения.</p>

      <div v-if="stopwords && stopwords.length">
        <h2>Стоп-слова:</h2>
        <table>
          <thead>
            <tr>
              <th @click="sortTableStopwords('word')" style="cursor: pointer;">
                Слово
              </th>
              <th @click="sortTableStopwords('count')" style="cursor: pointer;">
                Количество
                <span v-if="sortColumnStopwords === 'count'">{{ sortIconStopwords }}</span>
              </th>
              <th @click="sortTableStopwords('frequency')" style="cursor: pointer;">
                Частота
                  <span v-if="sortColumnStopwords === 'frequency'">{{ sortIconStopwords }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="word in sortedStopwords" :key="word.word">
              <td>{{ word.word }}</td>
              <td>{{ word.count }}</td>
              <td>{{ (word.frequency * 100).toFixed(4) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
});

app.mount("#app");