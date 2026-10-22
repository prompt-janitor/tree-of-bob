// iOS 27 refuses to launch an app built with its SDK unless the app uses the UIKit scene life cycle. Expo SDK 57
// ships the scene delegate (ExpoAppSceneDelegate, Objective-C name EXExpoAppSceneDelegate) but its project template
// still creates the window in the app delegate. This plugin switches the generated project over:
//   - Info.plist: a scene manifest whose one window scene uses Expo's scene delegate;
//   - AppDelegate.swift: provides the React Native factory to that delegate (ExpoReactNativeFactoryProvider) and no
//     longer creates the window or starts React Native itself (the scene delegate does both).
// Remove it once the Expo template adopts scenes itself.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: SCENE_DELEGATE }],
      },
    };
    return c;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('with-scene-lifecycle: expected a Swift AppDelegate.');
    let src = c.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(/class AppDelegate: ExpoAppDelegate \{/, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    // The scene delegate creates the window and starts React Native into it.
    src = src.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\([\s\S]*?\)\s*\n#endif\s*\n/,
      '',
    );
    if (!src.includes('ExpoReactNativeFactoryProvider') || src.includes('UIWindow(frame: UIScreen.main.bounds)')) {
      throw new Error('with-scene-lifecycle: the AppDelegate template changed; update the plugin.');
    }
    c.modResults.contents = src;
    return c;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
