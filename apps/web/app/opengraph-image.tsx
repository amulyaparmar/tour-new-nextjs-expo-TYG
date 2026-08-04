import { ImageResponse } from "next/og";

export const alt = "Tour — AI mystery shopping for multifamily leasing teams";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        background: "#F5F8FC",
        color: "#172033",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          right: -130,
          top: -180,
          borderRadius: 999,
          background: "#DCEAFF",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          left: -160,
          bottom: -190,
          borderRadius: 999,
          background: "#E8F1FF",
        }}
      />
      <div
        style={{
          width: 1040,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 78,
              height: 78,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 20,
              background: "#4D8AE5",
              color: "white",
              fontSize: 37,
              paddingLeft: 5,
            }}
          >
            ▶
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: -2 }}>Tour</div>
        </div>
        <div
          style={{
            maxWidth: 900,
            marginTop: 56,
            fontSize: 70,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -3,
          }}
        >
          AI mystery shopping for every leasing conversation.
        </div>
        <div
          style={{
            maxWidth: 860,
            marginTop: 28,
            color: "#53627A",
            fontSize: 29,
            lineHeight: 1.4,
          }}
        >
          Record property tours, evaluate performance, coach agents, and drive the next best action.
        </div>
      </div>
    </div>,
    size,
  );
}
