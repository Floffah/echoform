using System;
using System.Collections.Generic;
using System.Text;
using Godot;
using Godot.Collections;
using Zeroconf;

public partial class AuthoritativeServerConnection : Node {
	public static AuthoritativeServerConnection Instance { get; private set; }

	[Signal]
	public delegate void ConnectedEventHandler();

	public Godot.Collections.Dictionary<string, bool> EnforcedState { get; private set; } = new();

	private string origin;
	private bool connectReady = false;
	private WebSocketPeer _socket;

	private string _accessToken;
	private string _refreshToken;

	private readonly PackedScene couldntConnectModalScene =
		ResourceLoader.Load<PackedScene>("res://scenes/modal/specialised/couldnt_connect_modal.tscn");

	public override void _Ready() {
		if (OS.HasFeature("dedicated_server")) {
			EchoformLogger.Default.Info("Running in dedicated server mode. Skipping client authoritative server connection.");
			return;
		}

		if (Instance != null) {
			EchoformLogger.Default.Error("AuthoritativeServerConnection instance already exists. Destroying duplicate.");
			QueueFree();
			return;
		}

		Instance = this;

		IObservable<IZeroconfHost> results = ZeroconfResolver.Resolve("_http._tcp.local.");

		results.Subscribe(host => {
			if (origin != null) {
				// Already found a host
				return;
			}

			EchoformLogger.Default.Debug("Discovered Zeroconf host: ", host.DisplayName, " at ", host.IPAddress);

			host.Services.TryGetValue("echoform._http._tcp.local.", out var service);
			if (service != null) {
				origin = $"{host.IPAddress}:{service.Port}";
				connectReady = true;
				EchoformLogger.Default.Info("Using EchoformMMO service at: ", origin);
			} else {
				EchoformLogger.Default.Debug("No EchoformMMO service found on host: ", host.DisplayName);
			}
		}, error => {
			EchoformLogger.Default.Error("Error during Zeroconf service discovery: ", error);
			origin = "localhost:3000";
			Authenticate();
		}, () => {
			EchoformLogger.Default.Debug("Zeroconf service discovery completed.");
			if (origin == null) {
				EchoformLogger.Default.Debug("No Zeroconf service found. Falling back to localhost:3000");
				origin = "localhost:3000";
				Authenticate();
			}
		});
	}

	private void Authenticate() {
		connectReady = false;

		var httpNode = new HttpRequest();
		AddChild(httpNode);

		httpNode.RequestCompleted += OnRequestCompleted;

		var postBody = new Dictionary();

		postBody.Add("username", "floffah");
		postBody.Add("password", "password");

		httpNode.Request($"http://{origin}/v1/user/auth", new string[] {
			"Content-Type: application/json",
		}, HttpClient.Method.Post, Json.Stringify(postBody));
	}

	private void OnRequestCompleted(long result, long responseCode, string[] headers, byte[] body) {
		var json = Json.ParseString(Encoding.UTF8.GetString(body)).AsGodotDictionary();

		if (responseCode == 200) {
			EchoformLogger.Default.Info("Authentication succeeded.");
			EchoformLogger.Default.Debug("Auth Response: ", json);
			_accessToken = json["accessToken"].AsString();
			_refreshToken = json["refreshToken"].AsString();

			Connect();
		} else {
			EchoformLogger.Default.Error("Authentication failed. Response code: ", responseCode, ", Body: ",
				Encoding.UTF8.GetString(body));
			ShowCouldntConnectModal();
			Reset();
		}
	}

	private void Reset() {
		if (_socket != null) {
			_socket.Close();
			_socket = null;
		}

		_accessToken = null;
		_refreshToken = null;

		SetProcess(false);
	}

	private void Connect() {
		EchoformLogger.Default.Debug("Starting authoritative server connection...");
		_socket = new WebSocketPeer();

		_socket.SetHeartbeatInterval(5);
		_socket.SetHandshakeHeaders(new[] {
			"Device: EchoformMMOGame, Godot 4.4.1",
			"Authorization: Bearer " + _accessToken
		});
		var error = _socket.ConnectToUrl($"ws://{origin}/client");

		if (error != Error.Ok) {
			Reset();

			EchoformLogger.Default.Error("Failed to connect to authoritative server: ", error);
			ShowCouldntConnectModal();
			return;
		} else {
			SetProcess(true);
		}
	}

	public override void _Process(double delta) {
		if (connectReady && origin != null && _socket == null) {
			Authenticate();
		}

		if (_socket == null) {
			return;
		}

		_socket.Poll();

		var state = _socket.GetReadyState();

		if (state == WebSocketPeer.State.Open) {
			while (_socket.GetAvailablePacketCount() > 0) {
				var packet = _socket.GetPacket();
				if (packet is byte[] data) {
					var message = System.Text.Encoding.UTF8.GetString(data);
					EchoformLogger.Default.Debug("Received message: ", message);

					var parsedPacket = PacketTranslator.GetFromString(message);

					if (parsedPacket is ClientboundPacket clientboundPacket) {
						clientboundPacket.Handle();
						EchoformLogger.Default.Debug("Handled packet: ", clientboundPacket.Id);
					} else {
						EchoformLogger.Default.Debug("Received unknown packet type: ", parsedPacket?.GetType());
					}
				} else {
					EchoformLogger.Default.Debug("Received non-byte packet: ", packet);
				}
			}
		} else if (state == WebSocketPeer.State.Closing) {
			EchoformLogger.Default.Debug("WebSocket is closing.");
		} else if (state == WebSocketPeer.State.Closed) {
			EchoformLogger.Default.Debug("WebSocket is closed.", _socket.GetPacketError());

			Reset();
		} else {
			EchoformLogger.Default.Debug("WebSocket state: ", state);
		}
	}

	public void EmitConnected() {
		EmitSignal(SignalName.Connected);
	}

	public void SendPacket(ServerboundPacket packet) {
		if (_socket == null || _socket.GetReadyState() != WebSocketPeer.State.Open) {
			EchoformLogger.Default.Error("Cannot send packet, WebSocket is not open.");
			return;
		}

		var serializedPacketData = packet.Serialize();
		var serializedPacket = new Godot.Collections.Dictionary {
			["id"] = packet.Id,
			["data"] = serializedPacketData
		};

		var jsonString = Json.Stringify(serializedPacket);

		_socket.SendText(jsonString);
		EchoformLogger.Default.Debug("Sent packet: ", jsonString);
	}

	public void SendReady() {
		SendPacket(new ClientReadyPacket());
	}

	private void ShowCouldntConnectModal() {
		var couldntConnectModal = couldntConnectModalScene.Instantiate<CenterContainer>();
		couldntConnectModal.SetAnchorsPreset(Control.LayoutPreset.FullRect);
		GetTree().Root.AddChild(couldntConnectModal);
	}
}
