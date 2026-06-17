package environment

type Environment struct {
	Config Config
}

func LoadEnvironment() (Environment, error) {
	cfg, err := LoadConfig()
	if err != nil {
		return Environment{}, err
	}

	return Environment{
		Config: cfg,
	}, nil
}
