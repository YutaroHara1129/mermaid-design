# Synthetic retrieval sequence

Create one Mermaid sequence diagram answering: in what order does a user retrieve an existing document?

The following synchronous interactions occur in precisely this order:

1. Reader asks Web client to open a document.
2. Web client calls API with the document identifier.
3. API queries Database for the document location.
4. Database returns the location to API.
5. API requests document bytes from Object storage.
6. Object storage returns bytes to API.
7. API returns the document to Web client.
8. Web client displays the document to Reader.

Reader, Web client, API, Database, and Object storage are distinct participants. Calls and responses must be distinguishable. No authentication, polling, retries, alternative paths, or parallelism are specified.

Save diagram.mmd, diagram.svg, the necessary PNG exports, and a short review.md in output/. Check syntax by rendering, view the actual exported images for readability, and check each interaction and its order against the facts.
