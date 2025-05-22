require("dotenv").config();

const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const User = require("./models/User");
const Sensor = require("./models/Sensor");
const Presence = require("./models/Presence");
const engine = require("ejs-mate");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = process.env.PORT || 3000;

// DB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Passport config
require("./config/passport")(passport);

// Express setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.engine("ejs", engine);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session middleware
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.user ? req.user.username : null;
  next();
});

// Auth middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// Routes
app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/login", (req, res) =>
  res.render("login", { error: null, title: "Login" })
);

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user)
      return res.render("login", { error: info.message, title: "Login" });

    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect("/dashboard");
    });
  })(req, res, next);
});

app.get("/logout", (req, res) => {
  req.logout(() => res.redirect("/login"));
});

app.get("/register", (req, res) => {
  res.render("register", { error: null, title: "Register" });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.render("register", {
        error: "Username taken",
        title: "Register",
      });

    const newUser = new User({ username, password });
    await newUser.save();
    res.redirect("/login");
  } catch (err) {
    res.render("register", { error: "Error creating account" });
  }
});

app.get("/dashboard", isAuthenticated, async (req, res) => {
  const userId = req.user._id;

  const userSensors = await Sensor.aggregate([
    { $match: { user: userId } },

    {
      $lookup: {
        from: "presences",
        let: { sensorId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$sensor", "$$sensorId"] } } },
          { $sort: { registeredAt: -1 } },
          { $limit: 1 },
        ],
        as: "lastPresence",
      },
    },
    {
      $lookup: {
        from: "presences",
        localField: "_id",
        foreignField: "sensor",
        as: "allPresences",
      },
    },
    {
      $addFields: {
        lastPresence: { $arrayElemAt: ["$lastPresence", 0] },
        totalDetections: { $size: "$allPresences" },
      },
    },
    {
      $project: {
        allPresences: 0,
      },
    },
  ]);

  const sensorIds = userSensors.map((s) => s._id);

  const totalSensors = sensorIds.length;
  const totalDetections = await Presence.countDocuments({
    sensor: { $in: sensorIds },
  });
  const lastDetection = await Presence.findOne({ sensor: { $in: sensorIds } })
    .sort({ registeredAt: -1 })
    .lean();

  res.render("dashboard", {
    totalSensors,
    totalDetections,
    lastDetectionDate: lastDetection?.registeredAt || null,
    sensors: userSensors,
    user: req.user.username,
    title: "Dashboard",
  });
});

app.get("/sensors", isAuthenticated, async (req, res) => {
  const sensors = await Sensor.find({ user: req.user._id });
  res.render("sensors/list", {
    sensors,
    user: req.user.username,
    title: "Sensors",
    error: null,
  });
});

app.get("/sensors/register", isAuthenticated, (req, res) => {
  res.render("sensors/register", {
    user: req.user.username,
    title: "Sensors",
    error: null,
  });
});

app.post("/sensors/register", isAuthenticated, async (req, res) => {
  const { name } = req.body;
  const user = req.user._id;
  const token = uuidv4();
  try {
    const sensor = new Sensor({ name, user, token, registeredAt: new Date() });
    await sensor.save();
    res.redirect("/sensors");
  } catch (err) {
    console.error(err);
    res.render("sensors/register", {
      error: "Error creating sensor",
      title: "Sensors",
    });
  }
});

app.get("/sensors/detail/:sensorId", isAuthenticated, async (req, res) => {
  const sensorId = req.params.sensorId;
  try {
    const sensor = await Sensor.findById(sensorId);
    const detects = await Presence.find({ sensor: sensor._id });
    res.render("sensors/detail", { sensor, detects, title: "Sensor Details" });
  } catch (err) {
    res.redirect("/sensors");
  }
});

app.post("/webhook/detect", async (req, res) => {
  const { token, type } = req.body;
  const sensor = await Sensor.findOne({ token });
  if (!sensor) res.status(400).json({ message: "Invalid token" });
  const presence = new Presence({
    sensor: sensor._id,
    type,
    registeredAt: new Date(),
  });
  await presence.save();
  res.status(201).json({
    message: "Data received",
    data: req.body,
  });
});

app.listen(port, () => {
  console.log(`Server running at port ${port}`);
});
