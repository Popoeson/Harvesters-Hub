// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cors = require("cors");
const path = require("path");

// Initialize app
const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage for Multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "harvesters_hub", // folder name in Cloudinary
        allowed_formats: ["jpg", "jpeg", "png"],
    },
});

const upload = multer({ storage });

// Image Schema
const ImageSchema = new mongoose.Schema({
    url: String,
    comments: { type: String, default: "" },
    dateUploaded: { type: Date, default: Date.now },
});

const Image = mongoose.model("Image", ImageSchema);

// ROUTES

// Upload image (Admin)
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const newImage = new Image({
      url: req.file.path, // Cloudinary URL
      comments: req.body.comments || "",
    });

    await newImage.save();

    res.json({
      success: true,
      message: "Image uploaded successfully",
      url: newImage.url,
      image: newImage
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: error.message || "Upload failed" });
  }
});

// Fetch all images (Homepage)
app.get("/api/images", async (req, res) => {
    try {
        const images = await Image.find().sort({ dateUploaded: -1 });
        res.json(images);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch images" });
    }
});


// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
