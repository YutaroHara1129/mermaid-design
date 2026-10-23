# Synthetic document pipeline

Create one Mermaid flowchart answering: which components exchange work and results, and where can a failed job return?

Facts:

- The external Reader submits a document request to the Web client.
- The Web client sends the request to the API.
- The API stores the request in the Database and enqueues a job in the Queue.
- The Worker takes jobs from the Queue and reads the request from the Database.
- The Worker writes the completed document to Object storage.
- The Worker asks the Notifier to send a completion notice to the Reader.
- On a retryable failure, the Worker returns the job to the Queue. On a permanent failure, the Worker records the failure in the Database.
- Web client, API, Database, Queue, Worker, Object storage and Notifier are inside one service boundary. Reader is outside.
- Arrows describe the initiating component's action; edge labels must name that action. Layout direction has no semantic axis.

Save diagram.mmd, diagram.svg, the necessary PNG exports, and a short review.md in output/. Check syntax by rendering, view the actual exported images for readability, and check every relationship and boundary against the facts. Do not add components, relationships, responses, or ordering not stated here.
