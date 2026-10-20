import AppKit

/// The accent colour of a cover: the strongest hue in it, made bright enough to stand out on the panel. Near-black and
/// near-white pixels are skipped, and the rest are grouped by hue, weighted by how vivid they are, so a small red
/// detail on a cream cover still counts. Nil only for a cover with no colour at all.
enum CoverColor {
    private static let side = 32
    private static let hueGroups = 24

    static func accent(of image: NSImage) -> NSColor? {
        guard let picture = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }

        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
            guard
                let context = CGContext(
                    data: bytes.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }

            context.interpolationQuality = .medium
            context.draw(picture, in: CGRect(x: 0, y: 0, width: side, height: side))
            return true
        }

        guard drawn else { return nil }

        var weights = [CGFloat](repeating: 0, count: hueGroups)
        var red = [CGFloat](repeating: 0, count: hueGroups)
        var green = [CGFloat](repeating: 0, count: hueGroups)
        var blue = [CGFloat](repeating: 0, count: hueGroups)

        for start in stride(from: 0, to: pixels.count, by: 4) {
            let color = NSColor(
                red: CGFloat(pixels[start]) / 255, green: CGFloat(pixels[start + 1]) / 255,
                blue: CGFloat(pixels[start + 2]) / 255, alpha: 1)
            var hue: CGFloat = 0
            var saturation: CGFloat = 0
            var brightness: CGFloat = 0
            color.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: nil)

            // Shadows and paper white say nothing about the cover's colour
            guard brightness > 0.2, saturation > 0.06 else { continue }

            let group = min(hueGroups - 1, Int(hue * CGFloat(hueGroups)))
            let weight = saturation * saturation * brightness
            weights[group] += weight
            red[group] += color.redComponent * weight
            green[group] += color.greenComponent * weight
            blue[group] += color.blueComponent * weight
        }

        guard let best = weights.indices.max(by: { weights[$0] < weights[$1] }), weights[best] > 0.5 else { return nil }

        let average = NSColor(
            red: red[best] / weights[best], green: green[best] / weights[best], blue: blue[best] / weights[best],
            alpha: 1)
        var hue: CGFloat = 0
        var saturation: CGFloat = 0
        var brightness: CGFloat = 0
        average.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: nil)

        return NSColor(
            hue: hue, saturation: min(1, max(saturation * 1.3, 0.5)), brightness: max(brightness, 0.85), alpha: 1)
    }
}
