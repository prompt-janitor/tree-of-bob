import ExpoModulesCore
import UIKit

// The occlusion regions the system reserves over the app's window (iOS 27.1+), such as the iPhone Duo's status
// indicator, in window points. Each frame includes the margins interactive content should keep. The safe area
// covers the whole edge such an element sits on; these regions say which part of it is actually covered.
public class ReservedRegionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReservedRegions")

    // nil when the system can't report regions (before iOS 27.1, or an older SDK): use the safe area instead.
    AsyncFunction("occlusions") { () -> [[String: Double]]? in
      return MainActor.assumeIsolated { Self.occlusions() }
    }.runOnQueue(.main)
  }

  @MainActor
  static func occlusions() -> [[String: Double]]? {
#if compiler(>=6.4)
    if #available(iOS 27.1, *) {
      guard let window = keyWindow() else { return nil }
      return window.reservedRegions(kind: .occlusion).map { region in
        let f = region.frame
        return ["x": Double(f.minX), "y": Double(f.minY), "width": Double(f.width), "height": Double(f.height)]
      }
    }
#endif
    return nil
  }

  @MainActor
  static func keyWindow() -> UIWindow? {
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
    return windows.first { $0.isKeyWindow } ?? windows.first
  }
}
