class SafariTTS {
    constructor(options = {}) {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentUtterance = null;
        this.voicesLoaded = false;
        this.useGoogleTTS = true; // 啟用 Google TTS 後備
        
        this.settings = {
            rate: options.rate || 0.8,
            pitch: options.pitch || 1.0,
            volume: options.volume || 1.0,
            lang: options.lang || 'zh-TW',
            voice: options.voice || null
        };
        
        this.supportedLanguages = {
            'zh-TW': '繁體中文（台灣）',
            'zh-CN': '簡體中文（中國）', 
            'zh-HK': '繁體中文（香港）',
            'en-US': 'English (US)',
            'en-GB': 'English (UK)',
            'ja-JP': '日本語',
            'ko-KR': '한국어',
            'fr-FR': 'Français',
            'de-DE': 'Deutsch',
            'es-ES': 'Español'
        };

        // Google TTS 語言映射
        this.googleLangMap = {
            'zh-TW': 'zh-TW',
            'zh-CN': 'zh-CN',
            'zh-HK': 'zh-TW', // 香港用台灣語音
            'en-US': 'en',
            'en-GB': 'en',
            'ja-JP': 'ja',
            'ko-KR': 'ko',
            'fr-FR': 'fr',
            'de-DE': 'de',
            'es-ES': 'es'
        };
        
        this.availableVoices = [];
        this.init();
    }
    
    async init() {
        console.log('初始化 Safari TTS...');
        await this.loadVoicesWithRetry();
        this.setupEventListeners();
        this.showVoiceInfo();
    }

    async loadVoicesWithRetry(retries = 3) {
        for (let i = 0; i < retries; i++) {
            await this.loadVoices();
            if (this.availableVoices.length > 0) {
                this.voicesLoaded = true;
                console.log(`✅ 語音加載成功 (${this.availableVoices.length} 個語音)`);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('⚠️ 本地語音加載失敗，將使用 Google TTS');
    }

    async loadVoices() {
        return new Promise((resolve) => {
            const voices = speechSynthesis.getVoices();
            if (voices.length > 0) {
                this.availableVoices = voices;
                resolve(voices);
                return;
            }

            const handler = () => {
                const newVoices = speechSynthesis.getVoices();
                this.availableVoices = newVoices;
                speechSynthesis.removeEventListener('voiceschanged', handler);
                resolve(newVoices);
            };

            speechSynthesis.addEventListener('voiceschanged', handler);
        });
    }

    showVoiceInfo() {
        console.log('=== 系統語音資訊 ===');
        console.log(`總語音數量: ${this.availableVoices.length}`);
        
        if (this.availableVoices.length === 0) {
            console.log('❌ 沒有本地語音，將使用 Google TTS');
            return;
        }
        
        const chineseVoices = this.availableVoices.filter(v => v.lang.includes('zh'));
        const japaneseVoices = this.availableVoices.filter(v => v.lang.includes('ja'));
        
        console.log(`📢 中文語音: ${chineseVoices.length}`);
        console.log(`🎌 日語語音: ${japaneseVoices.length}`);
    }

    // 檢查本地語音是否支援某語言
    isLanguageSupported(lang) {
        if (this.availableVoices.length === 0) return false;
        
        return this.availableVoices.some(voice => 
            voice.lang === lang || voice.lang.startsWith(lang.split('-')[0])
        );
    }

    // 使用 Google Translate TTS
    async speakWithGoogleTTS(text, lang) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`🔊 使用 Google TTS: ${lang} - "${text.substring(0, 50)}..."`);
                
                const googleLang = this.googleLangMap[lang] || lang.split('-')[0];
                const encodedText = encodeURIComponent(text);
                
                // 創建多個備用 URL
                const urls = [
                    `https://translate.google.com/translate_tts?ie=UTF-8&tl=${googleLang}&client=tw-ob&q=${encodedText}`,
                    `https://translate.google.com.vn/translate_tts?ie=UTF-8&tl=${googleLang}&client=tw-ob&q=${encodedText}`,
                    `https://translate.google.com.hk/translate_tts?ie=UTF-8&tl=${googleLang}&client=tw-ob&q=${encodedText}`
                ];

                const audio = new Audio();
                let currentUrlIndex = 0;

                const playNext = () => {
                    if (currentUrlIndex >= urls.length) {
                        reject(new Error('所有 Google TTS 伺服器都失敗了'));
                        return;
                    }

                    audio.src = urls[currentUrlIndex];
                    console.log(`嘗試 URL ${currentUrlIndex + 1}: ${urls[currentUrlIndex].substring(0, 100)}...`);

                    audio.play().then(() => {
                        console.log('✅ Google TTS 播放成功');
                    }).catch(error => {
                        console.log(`❌ URL ${currentUrlIndex + 1} 失敗:`, error);
                        currentUrlIndex++;
                        playNext();
                    });
                };

                audio.onended = () => {
                    console.log('✅ Google TTS 播放完成');
                    resolve();
                };

                audio.onerror = () => {
                    console.log(`❌ URL ${currentUrlIndex + 1} 錯誤`);
                    currentUrlIndex++;
                    playNext();
                };

                playNext();

            } catch (error) {
                console.error('Google TTS 錯誤:', error);
                reject(error);
            }
        });
    }

    // 主要朗讀函數 - 自動後備到 Google TTS
    async speak(text, options = {}) {
        if (!text || text.trim() === '') {
            this.showStatus('請提供要朗讀的文字', 'warning');
            return;
        }

        const mergedSettings = { ...this.settings, ...options };
        const targetLang = mergedSettings.lang;

        // 先嘗試本地 TTS
        if (this.isLanguageSupported(targetLang)) {
            try {
                console.log(`🎯 嘗試本地 TTS: ${targetLang}`);
                await this.speakWithLocalTTS(text, mergedSettings);
                return;
            } catch (error) {
                console.log(`❌ 本地 TTS 失敗: ${error.message}`);
            }
        } else {
            console.log(`❌ 本地不支援 ${targetLang}，跳過本地 TTS`);
        }

        // 後備到 Google TTS
        if (this.useGoogleTTS) {
            try {
                await this.speakWithGoogleTTS(text, targetLang);
                this.showStatus(`✅ Google TTS: ${this.getLanguageName(targetLang)}`, 'playing');
            } catch (error) {
                this.showStatus(`❌ Google TTS 也失敗: ${error.message}`, 'error');
                throw error;
            }
        } else {
            throw new Error(`不支援的語言: ${targetLang}`);
        }
    }

    // 本地 TTS 實現
    async speakWithLocalTTS(text, settings) {
        return new Promise((resolve, reject) => {
            this.stop();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = settings.lang;
            utterance.rate = settings.rate;
            utterance.pitch = settings.pitch;
            utterance.volume = settings.volume;

            // 尋找合適的本地語音
            const voice = this.availableVoices.find(v => 
                v.lang === settings.lang || v.lang.startsWith(settings.lang.split('-')[0])
            );
            
            if (voice) {
                utterance.voice = voice;
            }

            utterance.onend = () => {
                console.log('✅ 本地 TTS 完成');
                this.isPlaying = false;
                resolve();
            };

            utterance.onerror = (event) => {
                console.error('本地 TTS 錯誤:', event.error);
                reject(new Error(`本地 TTS 錯誤: ${event.error}`));
            };

            utterance.onstart = () => {
                this.isPlaying = true;
                console.log('🔊 本地 TTS 開始');
            };

            this.currentUtterance = utterance;
            speechSynthesis.speak(utterance);

            this.showStatus(`🔊 本地 TTS: ${this.getLanguageName(settings.lang)}`, 'playing');
        });
    }

    // 測試語言支援
    async testLanguageSupport(lang) {
        const testTexts = {
            'zh-TW': '繁體中文測試',
            'zh-CN': '简体中文测试',
            'zh-HK': '繁體中文測試',
            'ja-JP': '日本語テスト',
            'en-US': 'English test',
            'ko-KR': '한국어 테스트'
        };

        const text = testTexts[lang] || 'Test';
        
        console.log(`\n=== 測試 ${lang} ===`);
        
        // 測試本地支援
        const localSupported = this.isLanguageSupported(lang);
        console.log(`本地支援: ${localSupported ? '✅' : '❌'}`);
        
        // 測試 Google TTS
        try {
            await this.speakWithGoogleTTS(text, lang);
            console.log(`Google TTS: ✅`);
            return { local: localSupported, google: true };
        } catch (error) {
            console.log(`Google TTS: ❌ (${error.message})`);
            return { local: localSupported, google: false };
        }
    }

    // 批量測試所有語言
    async testAllLanguages() {
        console.log('🚀 開始語言支援測試...');
        const results = {};
        
        for (const lang of Object.keys(this.supportedLanguages)) {
            results[lang] = await this.testLanguageSupport(lang);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 避免請求過快
        }
        
        console.log('\n=== 最終測試結果 ===');
        Object.keys(results).forEach(lang => {
            const result = results[lang];
            console.log(`${this.supportedLanguages[lang]}:`);
            console.log(`  本地: ${result.local ? '✅' : '❌'}`);
            console.log(`  Google: ${result.google ? '✅' : '❌'}`);
        });
        
        return results;
    }

    getLanguageName(langCode) {
        return this.supportedLanguages[langCode] || langCode;
    }

    setLanguage(lang) {
        this.settings.lang = lang;
        console.log('設定語言:', this.getLanguageName(lang));
    }

    stop() {
        // 停止本地 TTS
        speechSynthesis.cancel();
        this.isPlaying = false;
        this.isPaused = false;
        
        // 停止所有 Audio 元素
        const audios = document.querySelectorAll('audio');
        audios.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
    }

    pause() {
        if (this.isPlaying && !this.isPaused) {
            speechSynthesis.pause();
            this.isPaused = true;
        }
    }

    resume() {
        if (this.isPaused) {
            speechSynthesis.resume();
            this.isPaused = false;
        }
    }

    setRate(rate) {
        this.settings.rate = rate;
    }

    setPitch(pitch) {
        this.settings.pitch = pitch;
    }

    setVolume(volume) {
        this.settings.volume = volume;
    }

    showStatus(message, type) {
        console.log(`[${type}] ${message}`);
        if (typeof window.updateStatus === 'function') {
            window.updateStatus(message, type);
        }
    }

    updateUI() {
        // 更新按鈕狀態
    }

    getStatus() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            voicesLoaded: this.voicesLoaded,
            availableVoices: this.availableVoices.length,
            currentLanguage: this.settings.lang,
            useGoogleTTS: this.useGoogleTTS
        };
    }
}

// 全局初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 初始化智能 TTS 系統...');
        window.tts = new SafariTTS();
        
        // 加載完成後自動測試
        setTimeout(() => {
            console.log('開始自動語言測試...');
            window.tts.testAllLanguages().then(results => {
                console.log('自動測試完成!');
                
                // 檢查是否有可用的中文語音
                const chineseSupported = results['zh-CN'].local || results['zh-CN'].google;
                const japaneseSupported = results['ja-JP'].local || results['ja-JP'].google;
                
                if (!chineseSupported) {
                    console.warn('⚠️ 中文語音可能無法使用');
                }
                if (!japaneseSupported) {
                    console.warn('⚠️ 日語語音可能無法使用');
                }
            });
        }, 2000);
    });
} else {
    window.tts = new SafariTTS();
}
// exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SafariTTS;
} else {
    window.SafariTTS = SafariTTS;
}
