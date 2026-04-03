# CloudMind iOS Wrapper

This folder contains a minimal SwiftUI iPhone app that opens the live CloudMind site at `https://cloudmind.life`.

## What it does

- Loads the live website inside a native `WKWebView`
- Keeps navigation inside `cloudmind.life` in-app
- Opens off-domain links in Safari
- Locks the app to portrait on iPhone

## Open it

1. Open `ios/CloudMind.xcodeproj` in Xcode
2. Select your Apple team in Signing & Capabilities
3. Choose an iPhone simulator or device
4. Run the `CloudMind` target

## Notes

- The app icon set is a placeholder and still needs actual icon artwork
- The bundle identifier is currently `life.cloudmind.ios`
