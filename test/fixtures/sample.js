function helper(n) {
  return n * 2;
}

const arrow = (a, b) => a + b;

class AuthService {
  login(user) {
    return helper(user.length);
  }
}

module.exports = { helper, arrow, AuthService };
