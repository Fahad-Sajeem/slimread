protocol Store {
    func get(_ k: String) -> String
}

class AuthService {
    let db: [String: String]

    init(db: [String: String]) {
        self.db = db
    }

    func login(user: String) -> String? {
        return db[user]
    }
}

struct User {
    let id: String
}

func helper(_ n: Int) -> Int {
    return n * 2
}
