module Auth
  class AuthService
    def initialize(db)
      @db = db
    end

    def login(user)
      @db[user]
    end

    def self.hash(pw)
      pw.reverse
    end
  end
end

def helper(n)
  n * 2
end
