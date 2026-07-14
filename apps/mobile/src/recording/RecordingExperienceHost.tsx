import React from "react";
import { StyleSheet, View } from "react-native";
import { RecordingExperience } from "./RecordingExperience";
import { useRecording } from "./RecordingProvider";

/**
 * Keeps RecordingExperience mounted for the life of a live session so speech
 * continues while the UI is minimized and the user navigates the app.
 */
export function RecordingExperienceHost() {
  const {
    experienceVisible,
    liveMeta,
    draft,
    isRecording,
    setDraftNotes,
    addDraftAsset,
    addDraftParticipant,
    updateDraftParticipantNotes,
    runBeforeRecordingStart,
    requestUploadFile,
    requestCancel,
    requestFinish,
    setLiveSessionId,
  } = useRecording();

  if (!liveMeta || !draft) return null;

  // Stay mounted while the sheet is open or a recording is in progress.
  if (!experienceVisible && !isRecording) return null;

  return (
    <View
      pointerEvents={experienceVisible ? "auto" : "none"}
      style={[styles.host, !experienceVisible && styles.hostHidden]}
      accessibilityElementsHidden={!experienceVisible}
      importantForAccessibility={experienceVisible ? "yes" : "no-hide-descendants"}
    >
      <RecordingExperience
        title={liveMeta.title}
        caption={liveMeta.source === "session-detail" ? "Recording to this session" : undefined}
        sessionId={liveMeta.sessionId}
        agentName={liveMeta.agentName}
        prospectName={liveMeta.prospectName}
        propertyName={liveMeta.propertyName}
        notes={draft.notes}
        onNotesChange={setDraftNotes}
        assets={draft.assets}
        selectedAssetIds={draft.selectedAssetIds}
        attachments={draft.attachments}
        participants={draft.participants}
        onAddAsset={addDraftAsset}
        onAddParticipant={addDraftParticipant}
        onUpdateParticipantNotes={updateDraftParticipantNotes}
        onBeforeRecordingStart={runBeforeRecordingStart}
        onUploadFile={liveMeta.source === "create-session" ? requestUploadFile : undefined}
        onSessionCreated={setLiveSessionId}
        cancelIcon={liveMeta.source === "session-detail" ? "close" : "chevron-down"}
        onCancel={requestCancel}
        onFinish={requestFinish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
    backgroundColor: "#F7F8FB",
  },
  hostHidden: {
    opacity: 0,
    transform: [{ translateX: 4000 }],
  },
});
