import ActivityKit
import SwiftUI
import WidgetKit

struct LiveActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var subtitle: String?
    var timerEndDateInMilliseconds: Double?
    var progress: Double?
    var imageName: String?
    var dynamicIslandImageName: String?
  }

  var name: String
  var backgroundColor: String?
  var titleColor: String?
  var subtitleColor: String?
  var progressViewTint: String?
  var progressViewLabelColor: String?
  var deepLinkUrl: String?
  var timerType: DynamicIslandTimerType?
  var padding: Int?
  var paddingDetails: PaddingDetails?
  var imagePosition: String?
  var imageWidth: Int?
  var imageHeight: Int?
  var imageWidthPercent: Double?
  var imageHeightPercent: Double?
  var imageAlign: String?
  var contentFit: String?

  enum DynamicIslandTimerType: String, Codable {
    case circular
    case digital
  }

  struct PaddingDetails: Codable, Hashable {
    var top: Int?
    var bottom: Int?
    var left: Int?
    var right: Int?
    var vertical: Int?
    var horizontal: Int?
  }
}

struct LiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityAttributes.self) { context in
      TourRecordingLockScreenView(contentState: context.state)
        .activityBackgroundTint(
          context.attributes.backgroundColor.map { Color(hex: $0) }
        )
        .activitySystemActionForegroundColor(Color.white)
        .applyWidgetURL(from: context.attributes.deepLinkUrl)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading, priority: 1) {
          VStack(alignment: .leading, spacing: 7) {
            TourBrandLockup(compact: true)
            Text(context.state.title)
              .font(.caption)
              .fontWeight(.semibold)
              .foregroundStyle(.white.opacity(0.72))
              .lineLimit(1)
          }
            .dynamicIsland(verticalPlacement: .belowIfTooWide)
            .padding(.leading, 5)
            .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 6) {
            RecordingStatusLabel(status: context.state.subtitle)
            if let date = context.state.timerEndDateInMilliseconds {
              RecordingElapsedTimer(recordingStartDateInMilliseconds: date, font: .title3)
            }
          }
          .padding(.trailing, 5)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 8) {
            Circle()
              .fill(context.state.subtitle == "Paused" ? Color.orange : TourLiveActivityStyle.brandBlue)
              .frame(width: 7, height: 7)
            Text(context.state.subtitle ?? "Recording")
              .font(.caption)
              .fontWeight(.semibold)
              .foregroundStyle(.white.opacity(0.78))
            Spacer()
            Text("Tap to return to Tour")
              .font(.caption2)
              .foregroundStyle(.white.opacity(0.56))
          }
          .padding(.horizontal, 5)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
      } compactLeading: {
        TourPlayMark(size: 17)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
      } compactTrailing: {
        if let date = context.state.timerEndDateInMilliseconds {
          RecordingElapsedTimer(recordingStartDateInMilliseconds: date, font: .caption, compact: true)
            .applyWidgetURL(from: context.attributes.deepLinkUrl)
        } else {
          Image(systemName: context.state.subtitle == "Paused" ? "pause.fill" : "checkmark")
            .font(.caption.bold())
            .foregroundStyle(TourLiveActivityStyle.brandBlue)
            .applyWidgetURL(from: context.attributes.deepLinkUrl)
        }
      } minimal: {
        TourPlayMark(size: 15)
          .applyWidgetURL(from: context.attributes.deepLinkUrl)
      }
      .keylineTint(TourLiveActivityStyle.brandBlue)
    }
  }
}

private enum TourLiveActivityStyle {
  static let brandBlue = Color(red: 77 / 255, green: 138 / 255, blue: 229 / 255)
}

/// Native SwiftUI vector built from the Tour SVG play-mark path.
private struct TourPlayShape: Shape {
  func path(in rect: CGRect) -> Path {
    let scale = min(rect.width / 39, rect.height / 44)
    let xOffset = rect.midX - (19.5 * scale)
    let yOffset = rect.midY - (22 * scale)
    func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
      CGPoint(x: xOffset + (x * scale), y: yOffset + (y * scale))
    }

    var path = Path()
    path.move(to: point(36.8974, 18.2969))
    path.addCurve(
      to: point(36.8974, 24.7917),
      control1: point(39.4164, 19.7291),
      control2: point(39.4164, 23.3595)
    )
    path.addLine(to: point(5.58173, 42.5950))
    path.addCurve(
      to: point(0.0000991821, 39.3476),
      control1: point(3.0915, 44.0107),
      control2: point(0.0000991821, 42.2122)
    )
    path.addLine(to: point(0.0000991821, 3.74096))
    path.addCurve(
      to: point(5.58173, 0.493594),
      control1: point(0.0000991821, 0.87643),
      control2: point(3.0915, -0.922133)
    )
    path.addLine(to: point(36.8974, 18.2969))
    path.closeSubpath()
    return path
  }
}

private struct TourPlayMark: View {
  let size: CGFloat

  var body: some View {
    TourPlayShape()
      .fill(TourLiveActivityStyle.brandBlue)
      .frame(width: size, height: size)
      .accessibilityLabel("Tour")
  }
}

private struct TourBrandLockup: View {
  var compact = false

  var body: some View {
    Image("tour-logo-white")
      .resizable()
      .scaledToFit()
      .frame(width: compact ? 92 : 112, height: compact ? 27 : 33, alignment: .leading)
      .accessibilityLabel("Tour")
  }
}

private struct RecordingStatusLabel: View {
  let status: String?

  var body: some View {
    Text(status ?? "Recording")
      .font(.caption2)
      .fontWeight(.bold)
      .foregroundStyle(.white.opacity(0.76))
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(.white.opacity(0.12), in: Capsule())
  }
}

private struct RecordingElapsedTimer: View {
  let recordingStartDateInMilliseconds: Double
  let font: Font
  var compact = false

  private var recordingStartedAt: Date {
    Date(timeIntervalSince1970: recordingStartDateInMilliseconds / 1000)
  }

  var body: some View {
    Text(recordingStartedAt, style: .timer)
      .font(font)
      .fontWeight(.semibold)
      .monospacedDigit()
      .foregroundStyle(.white)
      .lineLimit(1)
      .minimumScaleFactor(0.72)
      .frame(width: compact ? 46 : nil, alignment: .trailing)
  }
}

private struct TourRecordingLockScreenView: View {
  let contentState: LiveActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        TourBrandLockup()
        Spacer()
        RecordingStatusLabel(status: contentState.subtitle)
      }

      Text(contentState.title)
        .font(.headline)
        .fontWeight(.semibold)
        .foregroundStyle(.white)
        .lineLimit(1)

      HStack(spacing: 10) {
        Circle()
          .fill(contentState.subtitle == "Paused" ? Color.orange : Color.white)
          .frame(width: 8, height: 8)
        Text(contentState.subtitle == "Paused" ? "Recording paused" : "Live recording")
          .font(.subheadline)
          .fontWeight(.medium)
          .foregroundStyle(.white.opacity(0.82))
        Spacer()
        if let date = contentState.timerEndDateInMilliseconds {
          RecordingElapsedTimer(recordingStartDateInMilliseconds: date, font: .headline)
        }
      }

      Capsule()
        .fill(.white.opacity(0.9))
        .frame(height: 4)
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 18)
  }
}
