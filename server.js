// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

// ---------- Middleware ----------
app.use(express.json());

// CORS – add your frontend origins as needed
app.use(
  cors({
    origin: [
      "http://localhost:5500",            // local static hosting
      "http://127.0.0.1:5500",
      "https://harvesters-hub.vercel.app", // e.g. Vercel domain
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// ---------- MongoDB ----------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ---------- Cloudinary ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage: sends files straight to Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "harvesters_hub",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    resource_type: "image" // ensure images only
  })
});

const upload = multer({ storage });

// ---------- Mongoose Schema---------
const ImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    comments: { type: String, default: "" },
    dateUploaded: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// ---------- Mongoose Models ---------
const Image = mongoose.model("Image", ImageSchema);

// ---------- Routes ----------

// Health probe
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// 🔹 Upload route (MULTIPLE files + comment)
app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const comment = req.body.comment || "";

    // Save each file as a new document in MongoDB
    const savedDocs = await Promise.all(
      req.files.map(file => {
        const newImage = new Image({
          url: file.path,         // Cloudinary URL
          comments: comment,      // One comment for all
        });
        return newImage.save();
      })
    );

    res.json({
      message: "Files uploaded and saved successfully ✅",
      files: savedDocs,   // return the saved DB docs
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed ❌" });
  }
});

// Get images (newest first)
app.get("/api/images", async (req, res) => {
  try {
    const images = await Image.find().sort({ createdAt: -1 });
    res.json({ success: true, images });
  } catch (error) {
    console.error("Fetch images error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch images" });
  }
});


// Global error handler – always return JSON
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

// ---------- Start ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Backend listening on port ${PORT}`));
