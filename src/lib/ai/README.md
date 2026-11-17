# AI service boundary

The live implementation is in backend/src/ai/. The browser never reads
OPENAI_API_KEY and never calls OpenAI directly. Provider requests are performed
by AstraClient through the Responses API behind the multipart optimizations route.

Server rules are loaded from an ignored backend/prompts/resume.local.txt file,
with a generic public fallback. Private instructions are excluded from Docker
builds and mounted at runtime. Source documents are treated as data. User writing
preferences come from the optional customPrompt field on each submission.

The backend validates inputs and structured outputs. React renders plain text;
model-generated HTML is never executed. See backend/prompts/README.md for private
rules and backend/src/ai/README.md for the flow, configuration, limits and tests.
