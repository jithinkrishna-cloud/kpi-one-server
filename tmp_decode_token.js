import jwt from "jsonwebtoken";

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjE4MiwidXNlcm5hbWUiOiJVbWVzaCIsImlhdCI6MTc3NTI5NDkyMSwiZXhwIjoxNzc1MzIzNzIxfQ.0hqZElD6htZnZEryjb3w8NHReR3bzSoP89ZZbqY2Ym4";

const decoded = jwt.decode(token);
console.log("🔍 Token Payload Anatomy:");
console.log(JSON.stringify(decoded, null, 2));
console.log("Keys found:", Object.keys(decoded));
