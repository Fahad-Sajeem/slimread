package auth

type AuthService struct {
	db map[string]string
}

type Store interface {
	Get(k string) string
}

func Helper(n int) int {
	return n * 2
}

func (s *AuthService) Login(user string) string {
	return s.db[user]
}
