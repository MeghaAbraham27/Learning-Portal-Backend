const express = require("express");
const db = require("./db");
require("dotenv").config();
const authenticateToken = require("./authMiddleware");

const router = express.Router();
router.post("/mock-tests", async (req, res) => {

    const { test_name, description, subject, exam_type, user_id } = req.body;

    const [result] = await db.query(
        `INSERT INTO mock_tests (test_name, description, subject, exam_type, user_id)
         VALUES (?, ?, ?, ?, ?)`,
        [test_name, description, subject, exam_type, user_id]
    );

    res.json({
        mock_test_id: result.insertId
    });

});

router.put("/mock-tests/:id/can-attempt", async (req, res) => {
    const { id } = req.params;

    try {
        const query = "UPDATE mock_tests SET can_attempt = 1 WHERE id = ?";

        const [result] = await db.execute(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Mock test not found"
            });
        }

        res.json({
            message: "can_attempt updated successfully",
            mock_test_id: id
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error"
        });
    }
});


router.post("/questions", async (req, res) => {
    const { mock_test_id, question_text, options } = req.body;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [questionResult] = await conn.query(
            "INSERT INTO questions (mock_test_id, question_text) VALUES (?, ?)",
            [mock_test_id, question_text]
        );

        const questionId = questionResult.insertId;

        for (const opt of options) {
            await conn.query(
                "INSERT INTO options (question_id, option_text, is_correct) VALUES (?, ?, ?)",
                [questionId, opt.text, opt.is_correct]
            );
        }

        await conn.commit();
        res.json({ message: "Question added successfully" });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

router.post("/questions/bulk", async (req, res) => {

    const { mock_test_id, questions } = req.body;

    if (!mock_test_id || !questions || questions.length === 0) {
        return res.status(400).json({ message: "Invalid request data" });
    }

    const conn = await db.getConnection();

    try {

        await conn.beginTransaction();

        for (const question of questions) {

            const [questionResult] = await conn.query(
                "INSERT INTO questions (mock_test_id, question_text, explanation) VALUES (?, ?, ?)",
                [mock_test_id, question.question_text, question.explanation]
            );

            const questionId = questionResult.insertId;

            for (const opt of question.options) {

                await conn.query(
                    "INSERT INTO options (question_id, option_text, is_correct) VALUES (?, ?, ?)",
                    [questionId, opt.text, opt.is_correct]
                );

            }

        }

        await conn.commit();

        res.json({
            message: "Questions added successfully"
        });

    } catch (err) {

        await conn.rollback();

        res.status(500).json({
            error: err.message
        });

    } finally {

        conn.release();

    }

});

router.post("/mock-tests/full", authenticateToken, async (req, res) => {

    const user_id = req.userId;

    const { test_name, description, subject, exam_type, questions } = req.body;

    const conn = await db.getConnection();

    try {

        await conn.beginTransaction();

        const [testResult] = await conn.query(
            `INSERT INTO mock_tests (user_id,test_name, description, subject, exam_type)
       VALUES (?, ?, ?, ?, ?)`,
            [user_id, test_name, description, subject, exam_type]
        );

        const mockTestId = testResult.insertId;

        for (const question of questions) {

            const [questionResult] = await conn.query(
                `INSERT INTO questions (mock_test_id, question_text, explanation)
         VALUES (?, ?, ?)`,
                [mockTestId, question.question_text, question.explanation]
            );

            const questionId = questionResult.insertId;

            for (const opt of question.options) {

                await conn.query(
                    `INSERT INTO options (question_id, option_text, is_correct)
           VALUES (?, ?, ?)`,
                    [questionId, opt.text, opt.is_correct]
                );

            }

        }

        await conn.commit();

        res.json({
            message: "Mock Test created",
            mock_test_id: mockTestId
        });

    } catch (err) {

        await conn.rollback();
        res.status(500).json({ error: err.message });

    } finally {

        conn.release();

    }

});

router.get("/mock-tests", authenticateToken, async (req, res) => {

    const userId = req.userId;

    const [tests] = await db.query(
        `
    SELECT 
      mt.id,
      mt.test_name,
      mt.subject,
      mt.exam_type,
      mt.can_attempt,
      COUNT(q.id) as question_count
    FROM mock_tests mt
    LEFT JOIN questions q ON mt.id = q.mock_test_id
    WHERE mt.user_id = ?
    GROUP BY mt.id
    `,
        [userId]
    );

    res.json(tests);

});

router.get("/mock-test/full/:id", async (req, res) => {

    const id = req.params.id;

    const [test] = await db.query(
        "SELECT * FROM mock_tests WHERE id=?",
        [id]
    );

    const [questions] = await db.query(
        "SELECT * FROM questions WHERE mock_test_id=?",
        [id]
    );

    for (const q of questions) {

        const [options] = await db.query(
            "SELECT * FROM options WHERE question_id=?",
            [q.id]
        );

        q.options = options.map(o => ({
            text: o.option_text,
            is_correct: o.is_correct
        }));

    }

    res.json({
        test: test[0],
        questions
    });

});

router.put("/mock-test/full/:id", async (req, res) => {

    const id = req.params.id;

    const { test_name, description, subject, exam_type, questions } = req.body;

    const conn = await db.getConnection();

    try {

        await conn.beginTransaction();

        await conn.query(
            `UPDATE mock_tests 
       SET test_name=?,description=?,subject=?,exam_type=? 
       WHERE id=?`,
            [test_name, description, subject, exam_type, id]
        );

        await conn.query(
            `DELETE o FROM options o
       JOIN questions q ON o.question_id=q.id
       WHERE q.mock_test_id=?`,
            [id]
        );

        await conn.query(
            "DELETE FROM questions WHERE mock_test_id=?",
            [id]
        );

        for (const question of questions) {

            const [qResult] = await conn.query(
                `INSERT INTO questions (mock_test_id,question_text,explanation)
         VALUES (?,?,?)`,
                [id, question.question_text, question.explanation]
            );

            const qId = qResult.insertId;

            for (const opt of question.options) {

                await conn.query(
                    `INSERT INTO options (question_id,option_text,is_correct)
           VALUES (?,?,?)`,
                    [qId, opt.text, opt.is_correct]
                );

            }

        }

        await conn.commit();

        res.json({ message: "Updated successfully" });

    } catch (err) {

        await conn.rollback();
        res.status(500).json({ error: err.message });

    } finally {

        conn.release();

    }

});

router.delete("/mock-test/:id", async (req, res) => {

    const id = req.params.id;

    await db.query(
        `DELETE o FROM options o
     JOIN questions q ON o.question_id=q.id
     WHERE q.mock_test_id=?`,
        [id]
    );

    await db.query(
        "DELETE FROM questions WHERE mock_test_id=?",
        [id]
    );

    await db.query(
        "DELETE FROM mock_tests WHERE id=?",
        [id]
    );

    res.json({ message: "Deleted successfully" });

});

router.get("/mock-tests/:mockTestId/questions", async (req, res) => {
    const { mockTestId } = req.params;

    const [[test]] = await db.query(
        "SELECT test_name FROM mock_tests WHERE id = ?",
        [mockTestId]
    );
    const [rows] = await db.query(
        `
    SELECT 
      q.id AS question_id,
      q.question_text,
      o.id AS option_id,
      o.option_text
    FROM questions q
    JOIN options o ON q.id = o.question_id
    WHERE q.mock_test_id = ?
    `,
        [mockTestId]
    );

    const questionsMap = {};

    rows.forEach(row => {
        if (!questionsMap[row.question_id]) {
            questionsMap[row.question_id] = {
                id: row.question_id,
                question_text: row.question_text,
                options: []
            };
        }
        questionsMap[row.question_id].options.push({
            id: row.option_id,
            option_text: row.option_text
        });
    });

    res.json({
        test_name: test.test_name,
        questions: Object.values(questionsMap)
    });
});

router.post("/mock-tests/:mockTestId/submit", authenticateToken, async (req, res) => {

    const user_id = req.userId;
    const { mockTestId } = req.params;
    const { answers, time_taken } = req.body;

    const conn = await db.getConnection();

    try {

        await conn.beginTransaction();

        const [[test]] = await conn.query(
            "SELECT subject FROM mock_tests WHERE id = ?",
            [mockTestId]
        );

        const isGate = test.subject === "GATE";

        let score = 0;

        for (const ans of answers) {

            let isCorrect = false;

            if (ans.selected_option_id === null) {

                await conn.query(
                    `
                    INSERT INTO user_answers
                    (user_id, mock_test_id, question_id, selected_option_id, is_correct)
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        user_id,
                        mockTestId,
                        ans.question_id,
                        null,
                        false
                    ]
                );

                continue;
            }

            const [[correct]] = await conn.query(
                `
                SELECT id FROM options
                WHERE question_id = ?
                AND is_correct = true
                `,
                [ans.question_id]
            );

            isCorrect = correct.id === ans.selected_option_id;

            if (isCorrect) {
                score += 1;
            } else {
                if (isGate) score -= 1;
            }

            await conn.query(
                `
                INSERT INTO user_answers
                (user_id, mock_test_id, question_id, selected_option_id, is_correct)
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    user_id,
                    mockTestId,
                    ans.question_id,
                    ans.selected_option_id,
                    isCorrect
                ]
            );
        }

        await conn.query(
            `
            INSERT INTO user_test_attempts
            (user_id, mock_test_id, score, total_questions, time_taken)
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                user_id,
                mockTestId,
                score,
                answers.length,
                time_taken
            ]
        );

        await conn.commit();

        res.json({
            score,
            total: answers.length,
            time_taken
        });

    } catch (err) {

        await conn.rollback();
        res.status(500).json({ error: err.message });

    } finally {

        conn.release();

    }

});

router.get("/mock-tests/:mockTestId/results", authenticateToken, async (req, res) => {
    const userId = req.userId;

    const { mockTestId } = req.params;

    try {

        const [rows] = await db.query(
            `
      SELECT 
        q.id AS question_id,
        q.question_text,
        q.explanation,
        o.id AS option_id,
        o.option_text,
        o.is_correct,
        ua.selected_option_id
      FROM questions q
      JOIN options o ON q.id = o.question_id
      LEFT JOIN user_answers ua
        ON ua.question_id = q.id
        AND ua.mock_test_id = ?
        AND ua.user_id = ?
      WHERE q.mock_test_id = ?
      `,
            [mockTestId, userId, mockTestId]
        );

        const questionMap = {};

        rows.forEach(row => {

            if (!questionMap[row.question_id]) {
                questionMap[row.question_id] = {
                    question_id: row.question_id,
                    question_text: row.question_text,
                    selected_option_id: row.selected_option_id,
                    explanation: row.explanation,
                    options: []
                };
            }

            questionMap[row.question_id].options.push({
                option_id: row.option_id,
                option_text: row.option_text,
                is_correct: row.is_correct
            });

        });

        res.json(Object.values(questionMap));

    } catch (err) {

        res.status(500).json({ error: err.message });

    }
});
router.get("/mock-tests/:mockTestId/attempt", authenticateToken, async (req, res) => {
    const userId = req.userId;

    const { mockTestId } = req.params;

    try {

        const [[attempt]] = await db.query(
            `
      SELECT score, total_questions, time_taken
      FROM user_test_attempts
      WHERE mock_test_id = ? AND user_id = ?
      `,
            [mockTestId, userId]
        );

        if (!attempt) {
            return res.status(404).json({ error: "No attempt found" });
        }

        res.json({
            score: attempt.score,
            total: attempt.total_questions,
            time_taken: attempt.time_taken
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/mock-tests/:subject", authenticateToken, async (req, res) => {
    const userId = req.userId;

    const { subject } = req.params;

    const [rows] = await db.query(
        `
        SELECT 
            mt.id,
            mt.test_name,
            mt.description,
            mt.exam_type,
            mt.can_attempt,
            uta.score,
            uta.total_questions,
            uta.time_taken
        FROM mock_tests mt
        LEFT JOIN user_test_attempts uta
            ON mt.id = uta.mock_test_id
            AND uta.user_id = ?
        WHERE mt.subject = ? AND mt.can_attempt = ?
        `,
        [userId, subject, 1]
    );

    const result = {
        PYQ: [],
        MOCK: []
    };

    rows.forEach(test => {

        const formatted = {
            id: test.id,
            test_name: test.test_name,
            description: test.description,
            attempted: test.score !== null,
            score: test.score,
            total: test.total_questions,
            time_taken: test.time_taken
        };

        if (test.exam_type === "PYQ") {
            result.PYQ.push(formatted);
        } else if (test.exam_type === "MOCK") {
            result.MOCK.push(formatted);
        }

    });

    res.json(result);
});

router.get("/student/progress", authenticateToken, async (req, res) => {

    const userId = req.userId;

    try {

        const [rows] = await db.query(`
      SELECT 
        mt.id AS test_id,
        mt.test_name,
        uta.score,
        uta.total_questions,

        ROUND((uta.score / uta.total_questions) * 100) AS percentage,

        CASE 
          WHEN (uta.score / uta.total_questions) * 100 >= 50 
          THEN 'PASS'
          ELSE 'FAIL'
        END AS status,

        uta.submitted_at,
        uta.time_taken,
        uta.remark

      FROM user_test_attempts uta
      JOIN mock_tests mt 
        ON uta.mock_test_id = mt.id

      WHERE uta.user_id = ?

      ORDER BY uta.submitted_at DESC
    `, [userId]);

        const formatted = rows.map(row => ({
            test_id: row.test_id,
            test_name: row.test_name,
            score: row.score,
            total: row.total_questions,
            percentage: row.percentage,
            status: row.status,
            completed_at: new Date(row.submitted_at).toLocaleString(),
            time_taken: row.time_taken,
            comment: row.remark || "No remarks"
        }));

        res.json(formatted);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch progress" });
    }

});

router.get("/student/progress/summary", authenticateToken, async (req, res) => {

    const userId = req.userId;

    try {

        const [[totalTests]] = await db.query(`
      SELECT COUNT(*) AS total FROM mock_tests
      WHERE can_attempt = 1
    `);

        const [[attemptedTests]] = await db.query(`
      SELECT COUNT(*) AS attempted 
      FROM user_test_attempts
      WHERE user_id = ?
    `, [userId]);

        res.json({
            total_tests: totalTests.total,
            attempted_tests: attemptedTests.attempted
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch summary" });
    }

});

router.put("/update-remark", authenticateToken, async (req, res) => {

    const { user_id, mock_test_id, remark } = req.body;

    try {

        await db.query(
            `UPDATE user_test_attempts 
       SET remark = ? 
       WHERE user_id = ? AND mock_test_id = ?`,
            [remark, user_id, mock_test_id]
        );

        res.json({ message: "Remark updated successfully" });

    } catch (err) {

        console.error(err);
        res.status(500).json({ message: "Failed to update remark" });

    }

});

router.get("/student-analysis", authenticateToken, async (req, res) => {

    const teacherId = req.userId;

    try {

        const [rows] = await db.query(
            `
      SELECT 
        mt.test_name,
        u.id AS user_id,
        u.name AS student_name,
        ta.mock_test_id,
        ta.remark,
        ta.score,
        ta.total_questions,
        ROUND((ta.score / ta.total_questions) * 100, 2) AS percentage,
        CASE 
          WHEN (ta.score / ta.total_questions) * 100 >= 40 THEN 'PASS'
          ELSE 'FAIL'
        END AS status,
        ta.submitted_at,
        ta.time_taken
      FROM user_test_attempts ta
      JOIN mock_tests mt ON ta.mock_test_id = mt.id
      JOIN usersinfo u ON ta.user_id = u.id
      WHERE mt.user_id = ?
      ORDER BY ta.submitted_at DESC
      `,
            [teacherId]
        );

        res.json(rows);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: "Failed to fetch analysis"
        });

    }

});

module.exports = router;