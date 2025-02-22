document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url');
  const customSound = document.getElementById('customSound');
  const soundSelect = document.getElementById('soundSelect');
  const customSoundContainer = document.getElementById('customSoundContainer');
  const saveButton = document.getElementById('saveSettings');
  const testButton = document.getElementById('testSound');

  // Function to play sound
  async function playSound(soundType, customSoundData = null) {
    try {
      let soundUrl;
      if (soundType === 'custom' && customSoundData) {
        soundUrl = customSoundData;
      } else {
        soundUrl = chrome.runtime.getURL(`sounds/${soundType}`);
      }
      
      console.log('Playing sound:', soundUrl);
      const audio = new Audio(soundUrl);
      audio.volume = 1.0;
      
      await audio.play();
      return new Promise((resolve) => {
        audio.onended = resolve;
      });
    } catch (error) {
      console.error('Error playing sound:', error);
      throw error;
    }
  }

  // Load saved settings
  chrome.storage.sync.get(['monitorUrl', 'soundType', 'customSoundData'], (result) => {
    if (result.monitorUrl) {
      urlInput.value = result.monitorUrl;
    }
    if (result.soundType) {
      soundSelect.value = result.soundType;
      if (result.soundType === 'custom') {
        customSoundContainer.style.display = 'block';
      }
    } else {
      soundSelect.value = 'default.mp3';
    }
  });

  // Handle sound selection change
  soundSelect.addEventListener('change', (e) => {
    customSoundContainer.style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  // Handle test button click
  testButton.addEventListener('click', async () => {
    const soundType = soundSelect.value;
    try {
      if (soundType === 'custom' && customSound.files.length > 0) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            await playSound('custom', e.target.result);
          } catch (error) {
            console.error('Error playing custom sound:', error);
            alert('Error playing sound');
          }
        };
        reader.readAsDataURL(customSound.files[0]);
      } else {
        await playSound(soundType);
      }
    } catch (error) {
      console.error('Error playing sound:', error);
      alert('Error playing sound');
    }
  });

  // Handle save button click
  saveButton.addEventListener('click', () => {
    if (!urlInput.value) {
      alert('Please enter monitoring URL');
      return;
    }

    const selectedSound = soundSelect.value;
    const settings = {
      monitorUrl: urlInput.value,
      soundType: selectedSound
    };

    if (selectedSound === 'custom' && customSound.files.length > 0) {
      const reader = new FileReader();
      reader.onload = (e) => {
        settings.customSoundData = e.target.result;
        chrome.storage.sync.set(settings, () => {
          chrome.runtime.sendMessage({ type: 'settingsUpdated' });
          alert('Settings saved successfully');
        });
      };
      reader.readAsDataURL(customSound.files[0]);
    } else {
      chrome.storage.sync.set(settings, () => {
        chrome.runtime.sendMessage({ type: 'settingsUpdated' });
        alert('Settings saved successfully');
      });
    }
  });

  // Handle messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'playSound') {
      playSound(request.soundType, request.customSoundData)
        .catch(error => console.error('Error playing sound:', error));
    }
  });
}); 