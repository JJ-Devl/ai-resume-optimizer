// Public content contract, shared with the frontend through type-only imports.
type Schema =
  | { type: "string"; enum?: readonly string[] }
  | { type: "array"; items: Schema }
  | {
      type: "object";
      properties: Record<string, Schema>;
      required: string[];
      additionalProperties: false;
    };
const text = { type: "string" } as const;
const array = <T extends Schema>(items: T) =>
  ({ type: "array", items }) as const;
const object = <T extends Record<string, Schema>>(properties: T) =>
  ({
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }) as const;
type Infer<S> = S extends { type: "string"; enum: readonly (infer E)[] }
  ? E
  : S extends { type: "string" }
    ? string
    : S extends { type: "array"; items: infer I }
      ? Infer<I>[]
      : S extends { type: "object"; properties: infer P }
        ? { [K in keyof P]: Infer<P[K]> }
        : never;

export const RESUME_CONTENT_SCHEMA = object({
  contact: object({
    name: text,
    email: text,
    phone: text,
    location: text,
    links: array(text),
  }),
  summary: text,
  skills: array(object({ category: text, items: array(text) })),
  experience: array(
    object({
      employer: text,
      title: text,
      location: text,
      startDate: text,
      endDate: text,
      bullets: array(text),
    }),
  ),
  education: array(
    object({
      institution: text,
      qualification: text,
      location: text,
      startDate: text,
      endDate: text,
      details: array(text),
    }),
  ),
  projects: array(
    object({
      name: text,
      description: text,
      links: array(text),
      bullets: array(text),
    }),
  ),
  certificationsAndAwards: array(
    object({
      type: { type: "string", enum: ["certification", "award"] } as const,
      name: text,
      issuer: text,
      date: text,
      expiryDate: text,
      details: array(text),
    }),
  ),
  languages: array(object({ name: text, proficiency: text })),
});
export const RESUME_SCHEMA = object({
  resume: RESUME_CONTENT_SCHEMA,
  changes: array(text),
  skillsAdded: array(text),
});
export const OPTIMIZATION_SCHEMA = object({
  ...RESUME_SCHEMA.properties,
  companyName: text,
  jobTitle: text,
});
export type StructuredResume = Infer<typeof RESUME_CONTENT_SCHEMA>;
export interface OptimizedResume {
  companyName?: string;
  jobTitle?: string;
  resume: StructuredResume;
  resumeText: string; // Derived locally; never a second AI-generated version.
  changes: string[];
  skillsAdded: string[];
}

function validate(value: unknown, schema: Schema): boolean {
  if (schema.type === "string")
    return (
      typeof value === "string" &&
      value.length <= 3000 &&
      (!schema.enum || schema.enum.includes(value))
    );
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.length <= 100 &&
      value.every((item) => validate(item, schema.items))
    );
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    Object.keys(row).length === schema.required.length &&
    schema.required.every(
      (key) =>
        Object.hasOwn(row, key) && validate(row[key], schema.properties[key]),
    )
  );
}
const clean = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);
const line = (values: string[]) => clean(values).join(" | ");
const dates = (start: string, end: string) => clean([start, end]).join(" – ");
const bullets = (values: string[]) =>
  clean(values)
    .map((v) => "• " + v)
    .join("\n");
export function renderResumeText(resume: StructuredResume): string {
  const sections: string[] = [];
  const add = (heading: string, entries: string[]) => {
    const content = clean(entries).join("\n\n");
    if (content) sections.push((heading ? heading + "\n" : "") + content);
  };
  add("", [
    clean([
      resume.contact.name,
      line([
        resume.contact.email,
        resume.contact.phone,
        resume.contact.location,
        ...resume.contact.links,
      ]),
    ]).join("\n"),
  ]);
  add("PROFESSIONAL SUMMARY", [resume.summary]);
  add(
    "SKILLS",
    resume.skills.map((s) =>
      s.items.some((v) => v.trim())
        ? (s.category.trim() ? s.category.trim() + ": " : "") +
          clean(s.items).join(", ")
        : "",
    ),
  );
  add(
    "EXPERIENCE",
    resume.experience.map((e) =>
      clean([
        line([e.title, e.employer, e.location, dates(e.startDate, e.endDate)]),
        bullets(e.bullets),
      ]).join("\n"),
    ),
  );
  add(
    "EDUCATION",
    resume.education.map((e) =>
      clean([
        line([
          e.qualification,
          e.institution,
          e.location,
          dates(e.startDate, e.endDate),
        ]),
        bullets(e.details),
      ]).join("\n"),
    ),
  );
  add(
    "PROJECTS",
    resume.projects.map((p) =>
      clean([
        line([p.name, ...p.links]),
        p.description,
        bullets(p.bullets),
      ]).join("\n"),
    ),
  );
  add(
    "CERTIFICATIONS & AWARDS",
    resume.certificationsAndAwards.map((e) =>
      clean([
        line([
          e.name,
          e.issuer,
          e.date,
          e.expiryDate.trim() ? "Expires: " + e.expiryDate.trim() : "",
        ]),
        bullets(e.details),
      ]).join("\n"),
    ),
  );
  add(
    "LANGUAGES",
    resume.languages.map((l) => line([l.name, l.proficiency])),
  );
  return sections.join("\n\n");
}
export function parseResumeOutput(text: string): OptimizedResume {
  if (text.length > 100000) throw new Error("Result too large");
  const value: unknown = JSON.parse(text);
  if (!validate(value, RESUME_SCHEMA))
    throw new Error("Invalid structured resume");
  const result = value as Infer<typeof RESUME_SCHEMA>;
  const resumeText = renderResumeText(result.resume);
  if (!resumeText.trim() || resumeText.length > 60000)
    throw new Error("Invalid resume content");
  return { ...result, resumeText };
}

/** Provider metadata is separate from the saved resume content/export contract. */
export function parseOptimizationOutput(text: string): OptimizedResume {
  if (text.length > 100000) throw new Error("Result too large");
  const value: unknown = JSON.parse(text);
  if (!validate(value, OPTIMIZATION_SCHEMA))
    throw new Error("Invalid optimization");
  const { companyName, jobTitle, ...content } = value as Infer<
    typeof OPTIMIZATION_SCHEMA
  >;
  if (companyName.trim().length > 160 || jobTitle.trim().length > 160)
    throw new Error("Invalid job metadata");
  return {
    ...parseResumeOutput(JSON.stringify(content)),
    companyName: companyName.trim(),
    jobTitle: jobTitle.trim(),
  };
}
