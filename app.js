const path = require("path");
const express = require("express");
const nunjucks = require("nunjucks");
const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redisClient = createClient({ url: redisUrl });

(async () => {
  redisClient.on("error", console.error);
  await redisClient.connect();

  const app = express();

  // Configure Nunjucks
  app.set("view engine", "njk");
  nunjucks.configure(
    [
      path.join(__dirname, "node_modules", "govuk-frontend", "dist", "govuk"),
      path.join(__dirname, "views"),
    ],
    {
      autoescape: true,
      express: app,
    }
  );

  app.use(express.urlencoded({ extended: false }));

  // Serve GOV.UK styles and JS
  app.use(
    "/govuk",
    express.static(
      path.join(__dirname, "node_modules", "govuk-frontend", "dist", "govuk")
    )
  );

  app.use(
    "/assets",
    express.static(
      path.join(
        __dirname,
        "node_modules",
        "govuk-frontend",
        "dist",
        "govuk",
        "assets"
      )
    )
  );

  // Routes
  app.get("/", (req, res) => {
    res.render("index");
  });

  app.get("/form", async (req, res) => {
    // Clear all Redis user session data
    const keys = await redisClient.keys("user:*");
    for (const key of keys) {
      await redisClient.del(key);
    }

    res.render("form");
  });

app.post("/form", async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.render("form", {
      error: {
        summary: [
          {
            text: "Enter your name",
            href: "#name"
          }
        ],
        message: "Enter your name"
      },
      name
    });
  }

  const id = Date.now().toString();
  await redisClient.hSet(`user:${id}`, "name", name.trim());
  res.redirect(`/age/${id}`);
});
  app.get("/age/:id", (req, res) => {
    res.render("age", { id: req.params.id });
  });

  app.post("/age/:id", async (req, res) => {
  const { age } = req.body;
  const id = req.params.id;

  if (!age) {
    return res.render("age", {
      id,
      error: {
        summary: [
          {
            text: "Select your age range",
            href: "#age"
          }
        ],
        message: "Select your age range"
      }
    });
  }

  await redisClient.hSet(`user:${id}`, "age", age);
  res.redirect(`/result/${id}`);
});

  app.get("/result/:id", async (req, res) => {
    const currentId = req.params.id;

    // Get all user keys
    const keys = await redisClient.keys("user:*");
    for (const key of keys) {
      const data = await redisClient.hGetAll(key);
      console.log(`Redis key: ${key}`);
      console.log("Data:", JSON.stringify(data, null, 2));
    }

    // Now fetch and display the current user data
    const user = await redisClient.hGetAll(`user:${currentId}`);
    if (!user.name) return res.status(404).send("Not found");

    res.render("result", { name: user.name, age: user.age });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
})();
