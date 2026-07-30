# Portfolio Chatbot RAG

The chatbot can retrieve extra context from documents in `KB/` before sending a chat request to the LLM.

## Setup

1. Create a Vercel Postgres database with `pgvector` enabled.
2. Add the required environment variables from `.env.example`.
3. Run `npm install`.
4. Run `npm run rag:index` to recursively load `KB/`, extract `.docx` text, chunk it, embed it, and refresh the vector table.
5. Start locally with `npm run dev`.

## Runtime Flow

1. Embed the user's query.
2. Retrieve the top matching chunks from Postgres using cosine similarity.
3. Assemble only those chunks into a context message.
4. Send the context message before the existing system prompt.
5. Fall back to the normal chatbot flow if RAG is not configured or retrieval fails.
