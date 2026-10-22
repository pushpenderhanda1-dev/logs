# Video Logs — static personal website

A minimal dark static website for personal video logs and bloopers.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Upload every file in this folder to the repository root (not the ZIP itself).
3. Open **Settings → Pages**.
4. Under build/deployment, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Open the published Pages URL. Use PIN `1234` initially; change `DEMO_PIN` in `app.js` before uploading if desired.

## Features

- Video Logs list sorted newest first
- Create, edit, view, and delete log entries
- Add a video and optional thumbnail to each entry
- Timestamped pointers with manual or current-playhead timestamps
- Clicking a pointer seeks the video
- Latest reached pointer is highlighted while playing or seeking
- Note overlay appears on crossing a timestamp during playback
- Editable observations with autosave and explicit save
- Separate First Bloopers archive, with video, title, date, description, edit and delete
- Responsive charcoal interface
- PIN screen and per-tab session unlock
- Data saved locally in IndexedDB

## Important storage limitation

This is a static-only app. Uploaded video files, thumbnails, notes, and observations are saved in **IndexedDB in the browser on the device where you use the site**. They are not uploaded to GitHub, shared with other users, or synced to another device. Clearing browser site data can delete them. Export/backup is not included in this first version.

For actual shared or cross-device storage, add a backend/storage service later. GitHub Pages cannot receive browser uploads into your repository.

The PIN is only a casual UI lock. It is visible in the JavaScript source and does not protect the data from someone who can inspect the site or browser storage.

## File size notes

Large videos may exceed browser storage limits or use substantial local storage. Use reasonably sized files. The browser may deny storage or evict data under storage pressure.

## Local testing

Service workers are not required for this app's core features. For local testing, run a static server (for example `python -m http.server`) rather than opening `index.html` directly, because browser storage behavior can differ for `file://` URLs.
