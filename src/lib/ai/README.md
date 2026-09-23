# AI service boundary

The next milestone will add AI integration inside backend/src/ai/, as a NestJS
service injected into GenerationsService. Keep provider keys and calls in the
backend. This frontend directory is reserved for UI-facing AI helpers only.

Validate inputs server-side and validate structured AI responses before rendering
documents. Keep resume facts grounded in the supplied document; do not invent
qualifications. Treat resume and job description text as untrusted data.
Document layout belongs to templates, not model-generated HTML or code.
