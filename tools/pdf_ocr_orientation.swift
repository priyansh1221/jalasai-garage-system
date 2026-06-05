import Foundation
import Vision
import AppKit

func parseOrientation(_ raw: String) -> CGImagePropertyOrientation {
    switch raw.uppercased() {
    case "UP":
        return .up
    case "RIGHT":
        return .right
    case "LEFT":
        return .left
    default:
        return .left
    }
}

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
guard args.count >= 3 else {
    fputs("usage: swift pdf_ocr_orientation.swift <orientation> <image-path>\n", stderr)
    exit(1)
}

let orientation = parseOrientation(args[1])
let path = args[2]
do {
    print(try runOCR(path: path, orientation: orientation))
} catch {
    fputs("ERROR: \(error)\n", stderr)
    exit(2)
}
