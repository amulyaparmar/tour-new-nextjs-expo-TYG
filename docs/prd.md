# MVP PRD: AI Mystery Shopping App for Sales Agents

## 1. Product Summary

Build a web and mobile app for sales agents to record tour sessions, upload recordings, view upcoming and past sessions, and receive AI-powered analysis on their performance.

The product is a mystery-shopping style coaching tool for tour/video sales experiences. The agent records a customer tour or sales session, the system transcribes the session, extracts screenshots from the video, analyzes the conversation against a rubric, and gives the agent clear feedback with evidence.

The uploaded sample mystery-shopping report should guide the scoring structure. It includes sections such as greeting, property tour and demonstration, closing techniques, follow-up, fair housing, and executive summary.

## 2. Platforms

## Web App: Next.js

The web app is for sales agents who prefer reviewing sessions, transcripts, analysis, and reports on a larger screen.

Agents can:

* View upcoming sessions
* View calendar
* Open old sessions
* Review AI analysis
* Watch recorded videos
* Read transcripts
* View screenshot evidence
* Complete follow-up actions
* Review their score history

## Mobile App: Expo React Native

The mobile app is for recording sessions in the field and checking feedback quickly.

Agents can:

* View today’s sessions
* Start recording
* Upload recordings
* Track processing status
* View AI analysis
* View past sessions
* Complete follow-up actions

## 3. MVP Goal

The MVP should help a sales agent answer:

“How did I perform in this session, what did I do well, what did I miss, what exact moments prove it, and what should I do next?”

The MVP should focus on:

* Session scheduling
* Calendar navigation
* Recording
* Uploading
* Transcription
* Screenshot extraction
* AI rubric analysis
* Agent-facing feedback
* Follow-up actions

## 4. Primary User

## Sales Agent

The sales agent is the main user of both web and mobile.

They should be able to:

* See upcoming sessions
* Record a new session
* Upload a session
* View old sessions
* View analysis for each session
* Understand their score
* See transcript evidence
* See screenshot evidence
* Get coaching suggestions
* Complete follow-up actions

## 5. MVP User Flow

## Scheduled Session Flow

1. Agent logs in.
2. Agent sees calendar with upcoming sessions.
3. Agent opens a scheduled session.
4. Agent reviews session details.
5. Agent taps “Start Recording”.
6. App shows recording consent reminder.
7. Agent records the tour/session.
8. Agent stops recording.
9. Agent adds optional notes.
10. Recording uploads.
11. Session moves to processing.
12. AI generates transcript, screenshots, and analysis.
13. Agent receives notification that analysis is ready.
14. Agent opens the session.
15. Agent reviews score, feedback, transcript, screenshots, and follow-up actions.

## Quick Recording Flow

1. Agent logs in.
2. Agent taps “Record New Session”.
3. Agent enters basic session details.
4. Agent starts recording.
5. Agent uploads recording.
6. AI analysis is generated.
7. Agent reviews feedback.

## 6. Calendar UI

Calendar is a core part of the product.

Agents should use the calendar to navigate:

* Upcoming sessions
* Today’s sessions
* Completed sessions
* Processing sessions
* Old reviewed sessions

## Calendar Views

For MVP:

* Month view
* Week view
* Day agenda view

## Calendar Event Statuses

Each calendar item/session should have a clear status:

* Scheduled
* Ready to Record
* Uploaded
* Processing
* Analysis Ready
* Reviewed
* Failed

## Calendar Event Card

Each session card should show:

* Session title
* Prospect/customer name or label
* Date and time
* Location
* Status
* Score, if available
* “Start Recording” button if scheduled
* “View Analysis” button if completed

## Calendar Actions

Agents can:

* Create a new session
* Edit a session
* Open a session
* Start recording from a session
* View analysis from a completed session
* Filter old sessions by date/status

## 7. Session Creation

Agents can create a session from web or mobile.

## Session Fields

Required:

* Session title
* Date/time
* Location or tour site

Optional:

* Prospect/customer name
* Tour type
* Notes
* Selected rubric
* Expected product/property/unit
* Follow-up reminder

## 8. Recording Flow

Recording is mainly mobile-first, but the web app can support upload if browser recording is not prioritized for MVP.

## Mobile Recording Requirements

The agent can:

* Start video recording
* Stop video recording
* Preview recording
* Upload recording
* Retry failed upload
* Add notes before upload
* See upload progress

## Web Recording / Upload Requirements

For MVP, web can support:

* Upload existing video/audio file
* View upload progress
* Start processing after upload

Browser-based recording can be added later.

## Consent Reminder

Before recording, show:

“Confirm that this session may be recorded according to your company policy and local laws.”

## 9. Session Detail Page

The session detail page is where the agent reviews everything.

## Session Detail Should Show

* Video player
* AI score
* Rubric breakdown
* Transcript
* Screenshot evidence
* Strengths
* Areas to improve
* Suggested rewrites
* Follow-up actions
* Processing status, if not complete

## Web Layout

Recommended layout:

Left side:

* Video player
* Screenshot carousel
* Transcript

Right side:

* Score card
* Rubric analysis
* Coaching feedback
* Follow-up actions

## Mobile Layout

Use tabs:

1. Summary
2. Video
3. Transcript
4. Screenshots
5. Actions

## 10. Transcription

After upload, the system should transcribe the recording.

## MVP Transcript Requirements

* Timestamped transcript
* Speaker labels if available
* Click transcript line to jump to video timestamp
* Highlight transcript lines referenced by AI feedback

## Transcript Segment Model

```ts
TranscriptSegment {
  id: string
  sessionId: string
  speaker: string
  startTime: number
  endTime: number
  text: string
}
```

## 11. Screenshot Extraction

The AI feedback should include screenshots from the video as evidence.

## MVP Screenshot Logic

Extract screenshots:

* Every 30 seconds
* Around AI-detected key moments
* Around moments connected to rubric scoring

Examples:

* Greeting moment
* Showing property/unit
* Discussing pricing
* Handling objection
* Closing attempt
* Follow-up discussion

## Screenshot Model

```ts
SessionScreenshot {
  id: string
  sessionId: string
  timestamp: number
  imageUrl: string
  reason: "interval" | "ai_key_moment" | "rubric_evidence"
  summary?: string
}
```

## 12. Rubric

The MVP should support a simple business rubric.

## Default Apartment Tour Rubric

Based on the sample mystery-shopping structure, use these sections:

1. Greeting
2. Needs Discovery
3. Tour / Demonstration
4. Personalization
5. Objection Handling
6. Closing
7. Follow-Up
8. Compliance / Fair Housing
9. Overall Summary

## Example Questions

Greeting:

* Did the agent greet the customer promptly?
* Did the agent introduce themselves?
* Did the agent give the customer attention?

Needs Discovery:

* Did the agent ask what the customer was looking for?
* Did the agent ask about move-in timeline?
* Did the agent ask how the customer heard about the property?

Tour / Demonstration:

* Did the agent explain the tour structure?
* Did the agent show relevant features?
* Did the agent explain benefits, not just features?

Objection Handling:

* Did the customer raise an objection?
* Did the agent address the objection properly?

Closing:

* Did the agent create urgency?
* Did the agent ask for the close?
* Did the agent explain next steps?

Follow-Up:

* Did the agent mention follow-up?
* Did the agent send or plan a follow-up?

Compliance:

* Did the agent avoid discriminatory language or steering?
* Were there any fair housing concerns?

## 13. AI Analysis

The AI should generate agent-facing coaching, not just a score.

## MVP AI Pipeline

1. Video/audio is uploaded.
2. Audio is extracted.
3. Transcript is generated.
4. AI identifies key moments.
5. Screenshots are extracted around key moments.
6. AI analyzes transcript and screenshots.
7. AI scores the session against the rubric.
8. AI generates coaching feedback.
9. AI generates follow-up actions.
10. Agent views the analysis.

## AI Analysis Should Include

* Overall score
* Section scores
* Question-level scoring
* Evidence from transcript
* Evidence from screenshots
* What the agent did well
* What the agent missed
* Suggested better wording
* Follow-up actions
* Confidence level where needed

## AI Should Avoid

* Making claims without evidence
* Saying something happened without transcript or screenshot support
* Overly generic feedback
* Harsh or demoralizing language
* Compliance accusations without flagging uncertainty

## 14. Agent Feedback View

The feedback should be clear and useful.

## Feedback Sections

### Overall Score

Example:
“82% - Strong session with good rapport, but closing could be improved.”

### What You Did Well

Examples:

* “You greeted the prospect warmly.”
* “You explained the property benefits clearly.”
* “You handled the parking objection well.”

### Opportunities to Improve

Examples:

* “You did not ask which other properties the prospect had visited.”
* “You did not clearly explain the application process.”
* “You could have asked for the close more directly.”

### Exact Moment Feedback

Each feedback item should show:

* Timestamp
* Transcript quote
* Screenshot
* Explanation
* Suggested improvement

Example:
“At 12:40, the prospect mentioned concern about parking. You responded clearly, but you could have connected the answer back to the prospect’s need for convenience.”

### Suggested Rewrite

Example:
“Since parking is important to you, I’d recommend this option because it gives you easier access and avoids the package pickup issue you mentioned.”

## 15. Follow-Up Actions

The AI should generate simple actions the agent can complete.

## Action Examples

* Send follow-up message to customer
* Share application link
* Clarify parking fees
* Send floor plan
* Schedule second tour
* Follow up within 24 hours
* Practice closing question
* Review objection-handling tip

## Action Fields

```ts
FollowUpAction {
  id: string
  sessionId: string
  title: string
  description: string
  priority: "low" | "medium" | "high"
  status: "open" | "completed" | "dismissed"
  suggestedMessage?: string
}
```

## 16. Agent Dashboard

The dashboard should be simple and agent-focused.

## Dashboard Cards

* Today’s sessions
* Upcoming sessions
* Sessions awaiting analysis
* Latest analysis
* Average score
* Open follow-up actions
* Recent sessions

## 17. Web App Screens

1. Login
2. Agent Dashboard
3. Calendar
4. Create Session
5. Session Detail
6. Analysis View
7. Transcript View
8. Follow-Up Actions
9. Upload Recording
10. Profile / Settings

## 18. Mobile App Screens

1. Login
2. Home
3. Calendar
4. Create Session
5. Start Recording
6. Recording Screen
7. Upload Progress
8. Session Processing Status
9. Analysis Summary
10. Transcript
11. Screenshots
12. Follow-Up Actions
13. Profile

## 19. Data Model

```ts
User {
  id: string
  name: string
  email: string
  role: "agent"
}

Business {
  id: string
  name: string
  industry?: string
}

Location {
  id: string
  businessId: string
  name: string
  address?: string
}

Material {
  id: string
  businessId: string
  name: string
  type: "rubric" | "training" | "other"
  fileUrl: string
  parsedText?: string
}

Rubric {
  id: string
  businessId: string
  name: string
  totalPoints: number
}

RubricSection {
  id: string
  rubricId: string
  title: string
  maxPoints: number
}

RubricQuestion {
  id: string
  sectionId: string
  question: string
  maxPoints: number
  evidenceRequired: boolean
}

Session {
  id: string
  businessId: string
  locationId?: string
  agentId: string
  rubricId?: string
  title: string
  prospectName?: string
  scheduledAt?: Date
  recordedAt?: Date
  status:
    | "scheduled"
    | "uploaded"
    | "transcribing"
    | "extracting_screenshots"
    | "analyzing"
    | "analysis_ready"
    | "reviewed"
    | "failed"
  videoUrl?: string
  audioUrl?: string
  duration?: number
  overallScore?: number
  createdAt: Date
}

TranscriptSegment {
  id: string
  sessionId: string
  speaker: string
  startTime: number
  endTime: number
  text: string
}

SessionScreenshot {
  id: string
  sessionId: string
  timestamp: number
  imageUrl: string
  reason: "interval" | "ai_key_moment" | "rubric_evidence"
  summary?: string
}

Analysis {
  id: string
  sessionId: string
  rubricId: string
  resultJson: object
  status: "processing" | "ready" | "failed"
  createdAt: Date
}

FollowUpAction {
  id: string
  sessionId: string
  title: string
  description: string
  priority: "low" | "medium" | "high"
  status: "open" | "completed" | "dismissed"
  suggestedMessage?: string
}
```

## 20. Backend API

## Auth

* POST /auth/login
* POST /auth/register
* GET /auth/me

## Business

* GET /business
* POST /business/select

## Calendar / Sessions

* GET /sessions/calendar
* GET /sessions
* POST /sessions
* GET /sessions/:id
* PATCH /sessions/:id
* POST /sessions/:id/upload
* POST /sessions/:id/process

## Transcript

* GET /sessions/:id/transcript

## Screenshots

* GET /sessions/:id/screenshots

## Analysis

* GET /sessions/:id/analysis
* POST /sessions/:id/analyze

## Actions

* GET /actions
* PATCH /actions/:id

## Materials / Rubric

* GET /rubric
* POST /materials/upload
* GET /materials

## 21. Background Jobs

Use workers for:

* Extract audio
* Transcribe audio
* Extract screenshots
* Run AI analysis
* Generate follow-up actions

Each job should update the session status.

## 22. MVP Acceptance Criteria

## Calendar

* Agent can view upcoming sessions.
* Agent can view old sessions.
* Agent can open a session from the calendar.
* Agent can start recording from a scheduled session.

## Recording

* Agent can record video on mobile.
* Agent can upload recording.
* Upload progress is visible.
* Failed upload can be retried.

## Analysis

* Agent can see when analysis is processing.
* Agent can view overall score.
* Agent can view section scores.
* Agent can view transcript evidence.
* Agent can view screenshot evidence.
* Agent can see strengths and improvement areas.
* Agent can see suggested follow-up actions.

## Web

* Agent can log in.
* Agent can view calendar.
* Agent can upload recording.
* Agent can view old sessions.
* Agent can view full analysis.

## Mobile

* Agent can log in.
* Agent can record session.
* Agent can view calendar.
* Agent can view analysis.
* Agent can complete actions.

## 23. Build Phases

## Phase 1: Foundation

* Auth
* Business selection
* Agent dashboard
* Session model
* Calendar UI

## Phase 2: Recording and Upload

* Mobile recording
* Web upload
* Storage integration
* Upload status

## Phase 3: Processing

* Audio extraction
* Transcription
* Screenshot extraction
* Processing statuses

## Phase 4: AI Analysis

* Rubric scoring
* Transcript evidence
* Screenshot evidence
* Coaching feedback
* Follow-up actions

## Phase 5: Agent Experience Polish

* Better analysis UI
* Calendar filters
* Score history
* Notification when analysis is ready

## 24. Key MVP Principle

This is not a manager-first QA platform yet.

The MVP is an agent-facing coaching app where sales agents can record sessions, see their calendar, review old sessions, and understand their AI-generated performance analysis with transcript and screenshot evidence.
