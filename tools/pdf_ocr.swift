import Foundation
import Vision
import AppKit

func runOCR(path: String, orientation: CGImagePropertyOrientation) throws -> String {
    let url = URL(fileURLWithPath: path)
    guard let image = NSImage(contentsOf: url) else { return "" }
    var rect = NSRect(origin: .zero, size: image.size)
    guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        return ""
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.008
    let handler = VNImageRequestHandler(cgImage: cg, orientation: orientation, options: [:])
    try handler.perform([request])
    let observations = request.results ?? []
    return observations
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("usage: swift pdf_ocr.swift <image-path>\n", stderr)
    exit(1)
}

let path = args[1]
for (label, orientation) in [("UP", CGImagePropertyOrientation.up),
                             ("RIGHT", .right),
                             ("LEFT", .left)] {
    print("=== \(label) ===")
    do {
        let text = try runOCR(path: path, orientation: orientation)
        print(String(text.prefix(2500)))
    } catch {
        print("ERROR: \(error)")
    }
    print()
}
