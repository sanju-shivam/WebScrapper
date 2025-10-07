import express from "express";
import axios from "axios";
import { load } from "cheerio";

const app  = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.urlencoded({ extended: true }));

// ----------  CONFIG  ----------
const roles = [
  "Brand Manager",
  "Growth Manager",
  "Digital Marketing Manager",
  "Product Marketing Manager",
  "Software Engineer",
  "Software Developer",
  "Full Stack Developer",
  "Backend Developer",
  "Php Developer",
  "Node js Developer",
  "Senior Software Engineer",
  "Java Developer",
  "Laravel Developer",
];
const timeOptions = [
  { label: "1 hour",   value: 1 },
  { label: "6 hours",  value: 6 },
  { label: "12 hours", value: 12 },
  { label: "24 hours", value: 24 },
  { label: "2 days",   value: 48 },
  { label: "3 days",   value: 72 },
  { label: "7 days",   value: 168 }
];

// ----------  HELPERS  ----------
function buildLinkedInURL(role, location, age) {
  const q  = encodeURIComponent(role.trim());
  const l  = encodeURIComponent(location.trim());
  const f  = `f_TPR=r${age * 3600}`;         // age in seconds
  return `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${l}&${f}`;
}

async function scrapeLinkedInJobs({ role, location, hoursOrDays }) {
  const url = buildLinkedInURL(role, location, hoursOrDays);
  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  });
//   const $ = cheerio.load(html);
  const $ = load(html);        
  const jobs = [];

  $(".base-card").each((_, el) => {
    const $el   = $(el);
    const title = $el.find(".base-search-card__title").text().trim();
    const company = $el.find(".base-search-card__subtitle").text().trim();
    const loc   = $el.find(".job-search-card__location").text().trim();
    const link  = $el.find("a.base-card__full-link").attr("href");
    const posted = $el.find("time").text().trim() || "recently";

    if (title && company && link) {
      jobs.push({ title, company, location: loc, link, posted });
    }
  });
  return jobs;
}

// ----------  ROUTES  ----------
app.get("/", (_req, res) => {
  res.render("index", { roles, timeOptions, result: null, query: null, error: null });
});

app.post("/search", async (req, res) => {
  const { role, location, hoursOrDays } = req.body;
  try {
    const jobs = await scrapeLinkedInJobs({
      role,
      location,
      hoursOrDays: parseInt(hoursOrDays, 10)
    });
    res.render("index", {
      roles,
      timeOptions,
      result: { count: jobs.length, jobs },
      query: { role, location, hoursOrDays },
      error: null
    });
  } catch (err) {
    console.error("Scraper error:", err.message);
    res.render("index", {
      roles,
      timeOptions,
      result: { count: 0, jobs: [] },
      query: { role, location, hoursOrDays },
      error: "Could not fetch jobs – LinkedIn may be rate-limiting."
    });
  }
});

// ----------  START  ----------
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));