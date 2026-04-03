import SwiftUI

struct ContentView: View {
    var body: some View {
        CloudMindWebView(url: URL(string: "https://cloudmind.life")!)
            .ignoresSafeArea(edges: .bottom)
    }
}

#Preview {
    ContentView()
}
