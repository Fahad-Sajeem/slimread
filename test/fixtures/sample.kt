package auth

class AuthService(private val db: Map<String, String>) {
    fun login(user: String): String? {
        return db[user]
    }
}

object Registry {
    fun get(): Int = 1
}

fun helper(n: Int): Int = n * 2
