pub struct AuthService {
    db: Vec<String>,
}

pub enum Role {
    Admin,
    Guest,
}

pub trait Store {
    fn get(&self, k: &str) -> String;
}

impl AuthService {
    pub fn login(&self, user: &str) -> Option<String> {
        self.db.iter().find(|u| u == &user).cloned()
    }
}

pub fn helper(n: i32) -> i32 {
    n * 2
}

mod inner {
    pub fn nested() {}
}
