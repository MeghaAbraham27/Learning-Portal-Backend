const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
require("dotenv").config();

const router = express.Router();
router.post("/signup", async (req, res) => {

  const { name, email, password, role, registrationId } = req.body;

  if (!name || !email || !password || !role || !registrationId) {
    return res.status(400).json({
      message: "All fields are required"
    });
  }

  try {

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      `INSERT INTO usersinfo 
       (name, email, password, role, registrationId)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, role, registrationId]
    );

    return res.status(201).json({
      message: "Signup successful"
    });

  } catch (err) {

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "User already exists"
      });
    }

    console.error("Signup Error:", err);

    return res.status(500).json({
      message: "Database error"
    });

  }

});

router.post("/login", async (req, res) => {

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password required"
    });
  }

  try {

    const [rows] = await db.query(
      `SELECT id, email, password, role, name, status
       FROM usersinfo
       WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }
   
    
    const user = rows[0];

    if (user.role !== "admin" && user.status !== "Approved") {
      return res.status(404).json({
        message: "Contact Administrator"
      });
    }


    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "15d"
      }
    );

    return res.json({
      token,
      role: user.role,
      name: user.name,
      user_id: user.id
    });

  } catch (err) {

    console.error("Login Error:", err);

    return res.status(500).json({
      message: "Server error"
    });

  }

});


module.exports = router;