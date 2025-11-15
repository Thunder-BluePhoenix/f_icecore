# F-IceCore Sound Files

This directory should contain the following audio files for call notifications:

## Required Files

1. **ringtone.mp3** - Plays when receiving an incoming call
   - Duration: 5-10 seconds (looped)
   - Format: MP3
   - Suggested: Pleasant phone ringing sound

2. **calling.mp3** - Plays when calling another user (waiting for answer)
   - Duration: 3-5 seconds (looped)
   - Format: MP3
   - Suggested: Calling/dial tone sound

3. **hangup.mp3** - Plays when call ends
   - Duration: 1-2 seconds (single play)
   - Format: MP3
   - Suggested: Call disconnect sound

## How to Add Custom Sounds

1. Place your MP3 files in this directory with the names above
2. Alternatively, update the paths in `f_icecore/public/js/call_ui.js`
3. Or configure custom sound paths in F IceCore Settings

## Free Sound Resources

You can find free sound effects from:
- [Freesound.org](https://freesound.org/)
- [Zapsplat.com](https://www.zapsplat.com/)
- [SoundBible.com](http://soundbible.com/)

## Default Behavior

If no sound files are present, the application will fail gracefully and continue to work without audio notifications.
