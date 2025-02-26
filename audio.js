// Vytvoříme AudioContext
let audioContext = null;
let audioBuffer = null;
let isInitialized = false;

// Funkce pro inicializaci AudioContext
async function initializeAudio() {
    if (!isInitialized) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            isInitialized = true;
            console.log('Audio.js: AudioContext initialized');
        } catch (error) {
            console.error('Audio.js: Failed to initialize AudioContext:', error);
            throw error;
        }
    }
}

// Funkce pro načtení zvukového souboru
async function loadSound(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch sound: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error('Audio.js: Failed to load sound:', error);
        throw error;
    }
}

// Funkce pro dekódování base64 dat
async function decodeBase64Sound(base64String) {
    try {
        // Odstraníme prefix data URL, pokud existuje
        const base64Data = base64String.split(',')[1] || base64String;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (error) {
        console.error('Audio.js: Failed to decode base64 data:', error);
        throw new Error('Invalid base64 sound data');
    }
}

// Funkce pro přehrání zvuku
async function playSound(soundType, customSoundData = null) {
    try {
        await initializeAudio();
        
        let audioBuffer;
        console.log('Audio.js: Playing sound type:', soundType);
        
        if (soundType === 'custom' && customSoundData) {
            try {
                // Dekódujeme base64 data
                const arrayBuffer = await decodeBase64Sound(customSoundData);
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                console.log('Audio.js: Custom sound decoded successfully');
            } catch (error) {
                console.error('Audio.js: Failed to decode custom sound:', error);
                throw new Error('Failed to decode custom sound');
            }
        } else {
            // Pro výchozí zvuky použijeme URL
            try {
                const soundUrl = chrome.runtime.getURL(`sounds/${soundType}`);
                audioBuffer = await loadSound(soundUrl);
                console.log('Audio.js: Default sound loaded successfully');
            } catch (error) {
                console.error('Audio.js: Failed to load default sound:', error);
                throw new Error('Failed to load default sound');
            }
        }
        
        // Vytvoříme source node
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // Vytvoříme gain node pro hlasitost
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        
        // Propojíme nodes
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Přehrajeme zvuk
        const startTime = audioContext.currentTime;
        source.start(startTime);
        console.log('Audio.js: Sound playback started');
        
        // Nastavíme délku přehrávání podle typu zvuku
        if (soundType === 'custom') {
            // Pro custom zvuky nastavíme limit na 15 sekund
            const duration = 15.0;
            source.stop(startTime + duration);
            console.log('Audio.js: Custom sound scheduled to stop after 15 seconds');
        } else if (soundType === 'notification.mp3') {
            // Pro notification.mp3 ponecháme 4 sekundy
            const duration = 4.0;
            source.stop(startTime + duration);
            console.log('Audio.js: Notification sound scheduled to stop after 4 seconds');
        }
        
        return new Promise((resolve) => {
            source.onended = () => {
                console.log('Audio.js: Sound playback ended');
                resolve();
            };
        });
    } catch (error) {
        console.error('Audio.js: Error playing sound:', error);
        throw error;
    }
}

// Posluchač zpráv
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'playSound') {
        console.log('Audio.js: Received playSound request:', request.soundType);
        
        // Přehrajeme zvuk a odešleme odpověď
        playSound(request.soundType, request.customSoundData)
            .then(() => {
                console.log('Audio.js: Sound played successfully');
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('Audio.js: Error playing sound:', error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true; // Indikuje asynchronní odpověď
    }
}); 