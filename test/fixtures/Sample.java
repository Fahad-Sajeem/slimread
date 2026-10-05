package auth;

public class AuthService {
    private final java.util.Map<String, String> db;

    public AuthService(java.util.Map<String, String> db) {
        this.db = db;
    }

    public String login(String user) {
        return db.get(user);
    }

    interface Store {
        String get(String k);
    }

    enum Role { ADMIN, GUEST }
}
