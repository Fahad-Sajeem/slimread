namespace Auth
{
    public interface IStore
    {
        string Get(string k);
    }

    public class AuthService
    {
        private readonly IStore db;

        public AuthService(IStore db)
        {
            this.db = db;
        }

        public string Login(string user)
        {
            return db.Get(user);
        }
    }

    public record User(string Id);
}
