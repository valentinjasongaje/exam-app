# ECE Video Opener

Lets the ▶ buttons on the exam app open review videos from the user's drive.
Browsers don't open local files from a website, so this registers an
`ecevideo:` link type (current Windows user only, no admin) that runs
`open-video.ps1`.

- Install: copy this folder to the review drive (e.g. `G:\ECE Video Opener`) and
  double-click `Install video opener.bat`.
- Remove: `Uninstall video opener.bat`.
- Links look like `ecevideo:open?path=Excel%20Review%20Center%5C...mp4`; the
  path is relative to the drive the script is on (see `lib/video-opener.ts`).
- The script only opens existing `.mp4` files under `Excel Review Center` or
  `REVIEW TUTORIAL`, and refuses `..`, drive letters and other extensions.
