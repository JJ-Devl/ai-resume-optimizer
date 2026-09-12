# AI service boundary

Milestone 2 will add a server-only optimization service here. Import `server-only`
in modules that read credentials. Validate inputs on the server, call the AI
provider there, and validate structured responses before rendering documents.
Never import a credential-bearing module into client components.

Keep resume facts grounded in the supplied document; do not invent qualifications.
Treat resume text and job descriptions as untrusted data. Document layout
belongs to document templates, not to model-generated HTML or code.
