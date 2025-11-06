// authMiddleware.js
const jwt = require('jsonwebtoken');

// function authMiddleware(req, res, next) {
//     const token = req.headers['authorization'];

//     if (!token) {
//         return res.status(401).json({ message: "No token provided" });
//     }

//     jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//         if (err) {
//             return res.status(401).json({ message: "Invalid token" });
//         }

//         req.userId = decoded.id;
//         next();
//     });
// }

// ✅ 3. Token шалгах middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token байхгүй байна" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Token хүчингүй" });
  }
};

module.exports = authMiddleware;


