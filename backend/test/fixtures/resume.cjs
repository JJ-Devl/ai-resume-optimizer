const output = {
  resume: {
    contact: {
      name: "Sample Candidate",
      email: "sample@example.test",
      phone: "",
      location: "",
      links: [],
    },
    summary: "Developer with reporting experience.",
    skills: [{ category: "Technical", items: ["SQL", "TypeScript"] }],
    experience: [
      {
        employer: "Example Company",
        title: "Developer",
        location: "",
        startDate: "2024",
        endDate: "Present",
        bullets: ["Prepared weekly reports."],
      },
    ],
    education: [],
    projects: [],
    certificationsAndAwards: [
      {
        type: "certification",
        name: "Sample ScrumMaster Certification",
        issuer: "Example Issuer",
        date: "2023",
        expiryDate: "2025",
        details: [],
      },
      {
        type: "award",
        name: "Second Place, Company Hackathon",
        issuer: "Example Company",
        date: "2024",
        expiryDate: "",
        details: ["Team award for a reporting prototype."],
      },
    ],
    languages: [],
  },
  changes: ["Targeted the skills section."],
  skillsAdded: ["SQL"],
};
module.exports = { output };
