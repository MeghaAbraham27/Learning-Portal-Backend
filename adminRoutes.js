const express = require("express");
const router = express.Router();
const db = require("./db");
const authenticateToken = require("./authMiddleware");

router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const [studentResult] = await db.query(
      "SELECT COUNT(*) AS students FROM usersinfo WHERE role='student'"
    );

    const [teacherResult] = await db.query(
      "SELECT COUNT(*) AS teachers FROM usersinfo WHERE role='teacher'"
    );

    res.json({
      students: studentResult[0].students,
      teachers: teacherResult[0].teachers,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching stats" });
  }
});

router.get("/users-by-role", authenticateToken, async (req, res) => {
  try {
    const { role, search } = req.query;

    let query = `
      SELECT id, name, email, registrationId, status, created_at 
      FROM usersinfo 
      WHERE role=?
    `;

    let values = [role];

    if (search) {
      query += ` AND (name LIKE ? OR registrationId LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY created_at DESC`;

    const [result] = await db.query(query, values);

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

router.put("/update-status/:id", authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    await db.query(
      "UPDATE usersinfo SET status=? WHERE id=?",
      [status, id]
    );

    res.json({ message: "Status updated successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating status" });
  }
});

module.exports = router;