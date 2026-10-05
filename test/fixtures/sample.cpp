#include <string>

namespace auth {

class AuthService {
public:
    std::string login(const std::string& user);
private:
    int count = 0;
};

std::string AuthService::login(const std::string& user) {
    return user;
}

int helper(int n) {
    return n * 2;
}

}
