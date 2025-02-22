# ServiceNow Queue Monitor

Chrome extension for monitoring ServiceNow ticket queue with sound notifications.

## Copyright (C) 2024 BertSoftwares Detailed license see below of this file.

Developed by BertSoftwares  
Contact: robert.pesout@gmail.com  
GitHub: [https://github.com/SkriptyRobert](https://github.com/SkriptyRobert)

© 2024 BertSoftwares. All rights reserved. 

## Features

- Real-time monitoring of ServiceNow ticket queue
- Sound alerts for new tickets
- Visual notifications with new ticket details
- Configurable check interval (currently 10 seconds)
- Customizable notification sounds (default, bell, notification, or custom sound)
- Ticket counter in the extension icon

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

## Usage

1. Click the extension icon in Chrome
2. Enter the ServiceNow queue URL to monitor
3. Select your preferred notification sound
4. Click "Save settings"

The extension will automatically start monitoring the specified URL and play a sound when new tickets are detected.

## Project Structure

```
├── manifest.json       # Extension manifest file
├── background.js       # Background script for monitoring
├── content.js          # Content script for page interaction
├── popup.html          # HTML for popup window
├── popup.js            # JavaScript for popup
├── audio.html          # HTML for sound playback
├── audio.js            # JavaScript for sound playback
├── icons/              # Icons folder
│   ├── icon16.png
│   ├── icon32.png
│   └── icon192.png
└── sounds/             # Sounds folder
    ├── default.mp3
    ├── bell.mp3
    └── notification.mp3
```

## Requirements

- Google Chrome version 88 or newer
- Access to ServiceNow instance

## Permissions

The extension requires the following permissions:
- `storage`: For saving settings
- `notifications`: For displaying notifications
- `alarms`: For periodic checks
- `tabs`: For sound playback
- Access to `*.service-now.com` domain

## Notes

- The extension monitors only the active ticket queue
- Sound notifications require one-time browser interaction after installation
- Only MP3 files are supported for custom sounds

## Copyright

/*
 * Developed by BertSoftwares
 * Author: Robert Pesout
 * Contact: robert.pesout@gmail.com
 * GitHub: (https://github.com/SkriptyRobert/ServiceNow_Extension)
 *
 * © 2024 Robert Pesout (BertSoftwares)
 *
 * This program is licensed under the GNU General Public License v3.0
 * (GPL-3.0) exclusively for TietoEvry. Redistribution or modification
 * by other parties is not permitted without explicit permission from
 * Robert Pesout (BertSoftwares).
 *
 * This program is free to use software for TietoEvry: you can redistribute it
 * and/or modify it under the terms of the GPL-3.0 License.
 *
 * The program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See <https://www.gnu.org/licenses/> for more details.
 */
