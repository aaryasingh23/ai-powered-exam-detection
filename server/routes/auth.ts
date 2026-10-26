import { Router } from 'express';
import { ApiError, hashPassword, issueToken, requireAny, requireRole, revokeToken, verifyPassword } from '../auth';
import { newId, one, run } from '../db';
import { mapExam, mapStudent } from '../repo';

export const authRouter = Router();

const STUDENT_ID_RE = /^[A-Z]{2,5}\d{3,8}$/;

function str(v: unknown, field: string, max = 120): string {
  if (typeof v !== 'string' || !v.trim()) throw new ApiError(400, 'VALIDATION', `${field} is required.`);
  return v.trim().slice(0, max);
}

authRouter.post('/register', (req, res) => {
  const studentId = str(req.body?.studentId, 'Student ID', 20).toUpperCase();
  const name = str(req.body?.name, 'Full name', 80);
  const email = str(req.body?.email, 'Email', 120).toLowerCase();
  const password = str(req.body?.password, 'Password', 128);
  if (!STUDENT_ID_RE.test(studentId)) throw new ApiError(400, 'VALIDATION', 'Student ID should look like STU1234 (letters followed by digits).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'VALIDATION', 'Please enter a valid email address.');
  if (password.length < 8) throw new ApiError(400, 'VALIDATION', 'Password must be at least 8 characters.');
  if (one(`SELECT id FROM students WHERE student_id = ?`, studentId)) {
    throw new ApiError(409, 'ALREADY_REGISTERED', 'This Student ID is already registered. Please sign in instead.');
  }
  const id = newId('stu');
  run(
    `INSERT INTO students (id, student_id, name, email, password_hash, verification_status, created_at)
     VALUES (?, ?, ?, ?, ?, 'UNREGISTERED', ?)`,
    id,
    studentId,
    name,
    email,
    hashPassword(password),
    Date.now(),
  );
  res.status(201).json({ student: mapStudent(one(`SELECT * FROM students WHERE id = ?`, id)!) });
});

authRouter.post('/login', (req, res) => {
  const studentId = str(req.body?.studentId, 'Student ID', 20).toUpperCase();
  const password = str(req.body?.password, 'Password', 128);
  const examCode = str(req.body?.examCode, 'Exam code', 20).toUpperCase();
  const student = one(`SELECT * FROM students WHERE student_id = ?`, studentId);
  // Same message for unknown ID and wrong password (no account enumeration).
  if (!student || !verifyPassword(password, student.password_hash)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid Student ID or password.');
  }
  const exam = one(`SELECT * FROM exams WHERE code = ?`, examCode);
  if (!exam) throw new ApiError(404, 'INVALID_EXAM_CODE', 'Invalid exam code. Please check the code shared by your examiner.');
  const now = Date.now();
  if (now < exam.start_time) throw new ApiError(403, 'EXAM_NOT_STARTED', 'This exam has not opened yet.');
  if (now > exam.end_time) throw new ApiError(403, 'EXAM_CLOSED', 'This exam window has closed.');
  run(`UPDATE students SET exam_id = ? WHERE id = ?`, exam.id, student.id);
  const { token, expiresAt } = issueToken(student.id, 'student', exam.id);
  res.json({
    token,
    expiresAt,
    role: 'student',
    student: mapStudent({ ...student, exam_id: exam.id }),
    exam: mapExam(exam),
  });
});

authRouter.post('/examiner/login', (req, res) => {
  const username = str(req.body?.username, 'Username', 60).toLowerCase();
  const password = str(req.body?.password, 'Password', 128);
  const examiner = one(`SELECT * FROM examiners WHERE username = ?`, username);
  if (!examiner || !verifyPassword(password, examiner.password_hash)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
  }
  const { token, expiresAt } = issueToken(examiner.id, 'examiner');
  res.json({ token, expiresAt, role: 'examiner', examiner: { id: examiner.id, username: examiner.username, name: examiner.name } });
});

authRouter.post('/forgot-password', (req, res) => {
  const studentId = str(req.body?.studentId, 'Student ID', 20).toUpperCase();
  const student = one(`SELECT id FROM students WHERE student_id = ?`, studentId);
  if (student) {
    run(
      `INSERT INTO password_reset_requests (id, student_id, created_at) VALUES (?, ?, ?)`,
      newId('rst'),
      studentId,
      Date.now(),
    );
  }
  res.json({
    message:
      'If this Student ID exists, a password reset request has been sent to the examination office. You will be contacted on your registered email.',
  });
});

authRouter.get('/me', requireAny, (req, res) => {
  const auth = req.auth!;
  if (auth.role === 'student') {
    const student = one(`SELECT * FROM students WHERE id = ?`, auth.userId);
    if (!student) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    const exam = auth.examId ? one(`SELECT * FROM exams WHERE id = ?`, auth.examId) : undefined;
    res.json({ role: 'student', student: mapStudent(student), exam: exam ? mapExam(exam) : null });
  } else {
    const examiner = one(`SELECT id, username, name FROM examiners WHERE id = ?`, auth.userId);
    if (!examiner) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    res.json({ role: 'examiner', examiner: { ...examiner } });
  }
});

authRouter.post('/logout', requireAny, (req, res) => {
  revokeToken(req.auth!.token);
  res.json({ ok: true });
});

// ---- Face reference (student only) -------------------------------------
// Only a numeric embedding is stored — no photo of the student.

authRouter.get('/face-reference', requireRole('student'), (req, res) => {
  const row = one(`SELECT face_reference, face_model FROM students WHERE id = ?`, req.auth!.userId);
  res.json({ descriptor: row?.face_reference ? JSON.parse(row.face_reference) : null, model: row?.face_model ?? null });
});

authRouter.put('/face-reference', requireRole('student'), (req, res) => {
  const model = str(req.body?.model, 'Model', 40);
  const descriptor = req.body?.descriptor;
  if (model !== 'demo') {
    if (!Array.isArray(descriptor) || descriptor.length < 64 || descriptor.length > 1024 || !descriptor.every((n) => typeof n === 'number')) {
      throw new ApiError(400, 'VALIDATION', 'Face reference must be a numeric embedding.');
    }
  }
  run(
    `UPDATE students SET face_reference = ?, face_model = ?, verification_status = 'REGISTERED' WHERE id = ?`,
    model === 'demo' ? null : JSON.stringify(descriptor.map((n: number) => Math.round(n * 1e5) / 1e5)),
    model,
    req.auth!.userId,
  );
  res.json({ student: mapStudent(one(`SELECT * FROM students WHERE id = ?`, req.auth!.userId)!) });
});

authRouter.post('/identity-verified', requireRole('student'), (req, res) => {
  const confidence = Number(req.body?.confidence);
  const passed = !!req.body?.passed;
  run(
    `UPDATE students SET verification_status = ? WHERE id = ?`,
    passed ? 'VERIFIED' : 'REVIEW',
    req.auth!.userId,
  );
  res.json({ ok: true, confidence: Number.isFinite(confidence) ? confidence : null });
});
