package realtime

type State string

const (
	StateLogin  State = "login"
	StatePlay   State = "play"
	StateClosed State = "closed"
)
