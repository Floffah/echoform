package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/google/jsonschema-go/jsonschema"
)

type packetSpec struct {
	ID        string
	Direction string
	Schema    string
	TypeName  string
}

type packet struct {
	Spec        packetSpec
	Schema      *jsonschema.Schema
	SchemaBytes []byte
	SchemaPath  string
	Fields      []field
	Enums       []enumType
}

type field struct {
	JSONName   string
	Name       string
	GoType     string
	CSharpType string
	Required   bool
}

type enumType struct {
	Name   string
	Values []enumValue
}

type enumValue struct {
	Name  string
	Value string
}

func main() {
	schemasDir := flag.String("schemas", "", "path to protocol schema directory")
	outPath := flag.String("out", "", "path to generated Go output")
	csharpOutPath := flag.String("csharp-out", "", "path to generated C# output")
	packageName := flag.String("package", "protocol", "generated Go package name")
	flag.Parse()

	if *schemasDir == "" {
		fatalf("-schemas is required")
	}
	if *outPath == "" && *csharpOutPath == "" {
		fatalf("at least one of -out or -csharp-out is required")
	}

	packets, err := loadPackets(*schemasDir)
	if err != nil {
		fatalf("%v", err)
	}

	if *outPath != "" {
		generated, err := generate(*packageName, packets)
		if err != nil {
			fatalf("%v", err)
		}
		if err := writeGeneratedFile(*outPath, generated); err != nil {
			fatalf("%v", err)
		}
	}

	if *csharpOutPath != "" {
		generated, err := generateCSharp(packets)
		if err != nil {
			fatalf("%v", err)
		}
		if err := writeGeneratedFile(*csharpOutPath, generated); err != nil {
			fatalf("%v", err)
		}
	}
}

func writeGeneratedFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write output: %w", err)
	}
	return nil
}

func loadPackets(schemasDir string) ([]packet, error) {
	entries, err := os.ReadDir(schemasDir)
	if err != nil {
		return nil, fmt.Errorf("read schema directory: %w", err)
	}

	seenIDs := map[string]bool{}
	seenTypes := map[string]bool{}
	var schemaPaths []string

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		schemaPaths = append(schemaPaths, filepath.Join(schemasDir, entry.Name()))
	}
	sort.Strings(schemaPaths)

	packets := make([]packet, 0, len(schemaPaths))

	for _, schemaPath := range schemaPaths {
		spec, err := specFromSchemaPath(schemaPath)
		if err != nil {
			return nil, err
		}
		if spec.ID == "" {
			return nil, fmt.Errorf("packet id is required")
		}
		if seenIDs[spec.ID] {
			return nil, fmt.Errorf("duplicate packet id %q", spec.ID)
		}
		seenIDs[spec.ID] = true

		if spec.Direction != "serverbound" && spec.Direction != "clientbound" {
			return nil, fmt.Errorf("packet %q has unsupported direction %q", spec.ID, spec.Direction)
		}
		if spec.Schema == "" {
			return nil, fmt.Errorf("packet %q schema is required", spec.ID)
		}
		if spec.TypeName == "" || !isExportedIdentifier(spec.TypeName) {
			return nil, fmt.Errorf("packet %q goType must be an exported Go identifier", spec.ID)
		}
		if seenTypes[spec.TypeName] {
			return nil, fmt.Errorf("duplicate type name %q", spec.TypeName)
		}
		seenTypes[spec.TypeName] = true

		schemaBytes, err := os.ReadFile(schemaPath)
		if err != nil {
			return nil, fmt.Errorf("read schema for %q: %w", spec.ID, err)
		}

		var schema jsonschema.Schema
		if err := json.Unmarshal(schemaBytes, &schema); err != nil {
			return nil, fmt.Errorf("parse schema for %q: %w", spec.ID, err)
		}
		if schema.Title == "" {
			return nil, fmt.Errorf("schema %q must define title for generated Go type", schemaPath)
		}
		if schema.Title != spec.TypeName {
			return nil, fmt.Errorf("schema %q title changed while loading: got %q, expected %q", schemaPath, schema.Title, spec.TypeName)
		}

		absSchemaPath, err := filepath.Abs(schemaPath)
		if err != nil {
			return nil, fmt.Errorf("resolve schema path for %q: %w", spec.ID, err)
		}
		baseURI := (&url.URL{Scheme: "file", Path: filepath.ToSlash(absSchemaPath)}).String()
		if _, err := schema.Resolve(&jsonschema.ResolveOptions{
			BaseURI: baseURI,
			Loader:  fileSchemaLoader,
		}); err != nil {
			return nil, fmt.Errorf("resolve schema for %q: %w", spec.ID, err)
		}

		fields, enums, err := fieldsForSchema(spec, &schema)
		if err != nil {
			return nil, fmt.Errorf("generate fields for %q: %w", spec.ID, err)
		}

		compactSchema := bytes.Buffer{}
		if err := json.Compact(&compactSchema, schemaBytes); err != nil {
			return nil, fmt.Errorf("compact schema for %q: %w", spec.ID, err)
		}

		packets = append(packets, packet{
			Spec:        spec,
			Schema:      &schema,
			SchemaBytes: compactSchema.Bytes(),
			SchemaPath:  filepath.ToSlash(spec.Schema),
			Fields:      fields,
			Enums:       enums,
		})
	}

	return packets, nil
}

func specFromSchemaPath(schemaPath string) (packetSpec, error) {
	name := filepath.Base(schemaPath)
	id := strings.TrimSuffix(name, ".json")
	id = strings.TrimSuffix(id, ".schema")

	direction := ""
	switch {
	case strings.HasPrefix(id, "client."):
		direction = "serverbound"
	case strings.HasPrefix(id, "server."):
		direction = "clientbound"
	default:
		return packetSpec{}, fmt.Errorf("schema file %q must start with client. or server.", name)
	}

	data, err := os.ReadFile(schemaPath)
	if err != nil {
		return packetSpec{}, fmt.Errorf("read schema %q: %w", schemaPath, err)
	}
	var schema jsonschema.Schema
	if err := json.Unmarshal(data, &schema); err != nil {
		return packetSpec{}, fmt.Errorf("parse schema %q: %w", schemaPath, err)
	}
	if schema.Title == "" || !isExportedIdentifier(schema.Title) {
		return packetSpec{}, fmt.Errorf("schema %q title must be an exported Go identifier", schemaPath)
	}

	return packetSpec{
		ID:        id,
		Direction: direction,
		Schema:    filepath.ToSlash(filepath.Join(filepath.Base(filepath.Dir(schemaPath)), name)),
		TypeName:  schema.Title,
	}, nil
}

func fileSchemaLoader(uri *url.URL) (*jsonschema.Schema, error) {
	if uri.Scheme != "file" {
		return nil, fmt.Errorf("unsupported schema URI %q", uri.String())
	}

	data, err := os.ReadFile(filepath.FromSlash(uri.Path))
	if err != nil {
		return nil, err
	}

	var schema jsonschema.Schema
	if err := json.Unmarshal(data, &schema); err != nil {
		return nil, err
	}
	return &schema, nil
}

func fieldsForSchema(spec packetSpec, schema *jsonschema.Schema) ([]field, []enumType, error) {
	if err := rejectUnsupportedComposition(schema); err != nil {
		return nil, nil, err
	}
	if schema.Ref != "" {
		return nil, nil, fmt.Errorf("root $ref is not supported yet")
	}
	if schemaType(schema) != "object" {
		return nil, nil, fmt.Errorf("root schema type must be object, got %q", schemaType(schema))
	}

	required := map[string]bool{}
	for _, name := range schema.Required {
		required[name] = true
	}

	propertyNames := schema.PropertyOrder
	if len(propertyNames) == 0 {
		for name := range schema.Properties {
			propertyNames = append(propertyNames, name)
		}
		sort.Strings(propertyNames)
	}

	fields := make([]field, 0, len(propertyNames))
	var enums []enumType
	for _, propertyName := range propertyNames {
		propertySchema := schema.Properties[propertyName]
		if propertySchema == nil {
			return nil, nil, fmt.Errorf("property %q is missing schema", propertyName)
		}

		goType, propertyEnums, err := goTypeForSchema(spec.TypeName, propertyName, propertySchema, required[propertyName])
		if err != nil {
			return nil, nil, fmt.Errorf("property %q: %w", propertyName, err)
		}

		fields = append(fields, field{
			JSONName:   propertyName,
			Name:       exportedName(propertyName),
			GoType:     goType,
			CSharpType: csharpTypeFromGoType(goType),
			Required:   required[propertyName],
		})
		enums = append(enums, propertyEnums...)
	}

	return fields, enums, nil
}

func rejectUnsupportedComposition(schema *jsonschema.Schema) error {
	if len(schema.AllOf) > 0 || len(schema.AnyOf) > 0 || len(schema.OneOf) > 0 || schema.Not != nil {
		return fmt.Errorf("allOf/anyOf/oneOf/not are not supported yet")
	}
	if len(schema.PatternProperties) > 0 {
		return fmt.Errorf("patternProperties is not supported yet")
	}
	if len(schema.DependentRequired) > 0 || len(schema.DependentSchemas) > 0 {
		return fmt.Errorf("dependent schemas are not supported yet")
	}
	return nil
}

func goTypeForSchema(parentType, propertyName string, schema *jsonschema.Schema, required bool) (string, []enumType, error) {
	if err := rejectUnsupportedComposition(schema); err != nil {
		return "", nil, err
	}
	if schema.Ref != "" {
		return "", nil, fmt.Errorf("property $ref is not supported yet")
	}

	var enums []enumType
	goType := ""

	switch schemaType(schema) {
	case "string":
		if len(schema.Enum) > 0 {
			enumName := parentType + exportedName(propertyName)
			enum, err := enumForSchema(enumName, schema)
			if err != nil {
				return "", nil, err
			}
			enums = append(enums, enum)
			goType = enumName
		} else {
			goType = "string"
		}
	case "boolean":
		goType = "bool"
	case "integer":
		goType = "int64"
	case "number":
		goType = "float64"
	case "array":
		if schema.Items == nil {
			return "", nil, fmt.Errorf("array items schema is required")
		}
		itemType, itemEnums, err := goTypeForSchema(parentType, propertyName+"Item", schema.Items, true)
		if err != nil {
			return "", nil, err
		}
		enums = append(enums, itemEnums...)
		goType = "[]" + itemType
	case "object":
		return "", nil, fmt.Errorf("nested object properties are not supported yet")
	default:
		return "", nil, fmt.Errorf("unsupported schema type %q", schemaType(schema))
	}

	if !required && !strings.HasPrefix(goType, "[]") {
		goType = "*" + goType
	}

	return goType, enums, nil
}

func enumForSchema(name string, schema *jsonschema.Schema) (enumType, error) {
	enum := enumType{Name: name}
	seen := map[string]bool{}
	for _, rawValue := range schema.Enum {
		value, ok := rawValue.(string)
		if !ok {
			return enumType{}, fmt.Errorf("only string enum values are supported")
		}
		if seen[value] {
			return enumType{}, fmt.Errorf("duplicate enum value %q", value)
		}
		seen[value] = true
		enum.Values = append(enum.Values, enumValue{
			Name:  name + exportedName(value),
			Value: value,
		})
	}
	return enum, nil
}

func generate(packageName string, packets []packet) ([]byte, error) {
	var buf bytes.Buffer

	fmt.Fprintf(&buf, "// Code generated by go run ./cmd/protocolgen; DO NOT EDIT.\n")
	fmt.Fprintf(&buf, "package %s\n\n", packageName)
	fmt.Fprintf(&buf, "import (\n")
	fmt.Fprintf(&buf, "%q\n", "encoding/json")
	fmt.Fprintf(&buf, "%q\n", "fmt")
	fmt.Fprintf(&buf, "%q\n", "net/url")
	fmt.Fprintf(&buf, "\n%q\n", "github.com/google/jsonschema-go/jsonschema")
	fmt.Fprintf(&buf, ")\n\n")

	writeHeaderTypes(&buf, packets)
	writePayloadTypes(&buf, packets)
	writePacketTypes(&buf, packets)
	writeSchemaValidation(&buf, packets)
	writeDecodeEncode(&buf, packets)

	formatted, err := format.Source(buf.Bytes())
	if err != nil {
		return nil, fmt.Errorf("format generated source: %w\n%s", err, buf.String())
	}
	return formatted, nil
}

func writeHeaderTypes(buf *bytes.Buffer, packets []packet) {
	fmt.Fprintf(buf, "type PacketID string\n\n")
	fmt.Fprintf(buf, "const (\n")
	for _, packet := range packets {
		fmt.Fprintf(buf, "%s PacketID = %q\n", packetIDConst(packet), packet.Spec.ID)
	}
	fmt.Fprintf(buf, ")\n\n")

	fmt.Fprintf(buf, "type Envelope struct {\n")
	fmt.Fprintf(buf, "ID PacketID `json:\"id\"`\n")
	fmt.Fprintf(buf, "Data json.RawMessage `json:\"data,omitempty\"`\n")
	fmt.Fprintf(buf, "}\n\n")

	fmt.Fprintf(buf, "type ServerboundPacket interface {\n")
	fmt.Fprintf(buf, "ID() PacketID\n")
	fmt.Fprintf(buf, "isServerboundPacket()\n")
	fmt.Fprintf(buf, "}\n\n")

	fmt.Fprintf(buf, "type ClientboundPacket interface {\n")
	fmt.Fprintf(buf, "ID() PacketID\n")
	fmt.Fprintf(buf, "isClientboundPacket()\n")
	fmt.Fprintf(buf, "}\n\n")
}

func writePayloadTypes(buf *bytes.Buffer, packets []packet) {
	for _, packet := range packets {
		for _, enum := range packet.Enums {
			fmt.Fprintf(buf, "type %s string\n\n", enum.Name)
			fmt.Fprintf(buf, "const (\n")
			for _, value := range enum.Values {
				fmt.Fprintf(buf, "%s %s = %q\n", value.Name, enum.Name, value.Value)
			}
			fmt.Fprintf(buf, ")\n\n")
		}

		fmt.Fprintf(buf, "type %s struct {\n", packet.Spec.TypeName)
		for _, field := range packet.Fields {
			tag := field.JSONName
			if !field.Required {
				tag += ",omitempty"
			}
			fmt.Fprintf(buf, "%s %s `json:%s`\n", field.Name, field.GoType, strconv.Quote(tag))
		}
		fmt.Fprintf(buf, "}\n\n")
	}
}

func writePacketTypes(buf *bytes.Buffer, packets []packet) {
	for _, packet := range packets {
		packetType := packet.Spec.TypeName + "Packet"
		fmt.Fprintf(buf, "type %s struct { Data %s `json:\"data\"` }\n\n", packetType, packet.Spec.TypeName)
		fmt.Fprintf(buf, "func (%s) ID() PacketID { return %s }\n", packetType, packetIDConst(packet))
		if packet.Spec.Direction == "serverbound" {
			fmt.Fprintf(buf, "func (%s) isServerboundPacket() {}\n\n", packetType)
		} else {
			fmt.Fprintf(buf, "func (%s) isClientboundPacket() {}\n\n", packetType)
		}
	}
}

func writeSchemaValidation(buf *bytes.Buffer, packets []packet) {
	fmt.Fprintf(buf, "var packetSchemas = map[PacketID]*jsonschema.Resolved{}\n\n")

	fmt.Fprintf(buf, "var generatedSchemaSources = map[string]string{\n")
	for _, packet := range packets {
		fmt.Fprintf(buf, "%q: %s,\n", packet.SchemaPath, strconv.Quote(string(packet.SchemaBytes)))
		if packet.Schema.ID != "" {
			fmt.Fprintf(buf, "%q: %s,\n", packet.Schema.ID, strconv.Quote(string(packet.SchemaBytes)))
		}
	}
	fmt.Fprintf(buf, "}\n\n")

	fmt.Fprintf(buf, "func init() {\n")
	for _, packet := range packets {
		fmt.Fprintf(buf, "mustRegisterPacketSchema(%s, %q, generatedSchemaSources[%q])\n", packetIDConst(packet), "schema://echoform/"+packet.SchemaPath, packet.SchemaPath)
	}
	fmt.Fprintf(buf, "}\n\n")

	fmt.Fprintf(buf, "func mustRegisterPacketSchema(id PacketID, baseURI string, raw string) {\n")
	fmt.Fprintf(buf, "var schema jsonschema.Schema\n")
	fmt.Fprintf(buf, "if err := json.Unmarshal([]byte(raw), &schema); err != nil { panic(fmt.Sprintf(\"parse schema %%s: %%v\", id, err)) }\n")
	fmt.Fprintf(buf, "resolved, err := schema.Resolve(&jsonschema.ResolveOptions{BaseURI: baseURI, Loader: generatedSchemaLoader})\n")
	fmt.Fprintf(buf, "if err != nil { panic(fmt.Sprintf(\"resolve schema %%s: %%v\", id, err)) }\n")
	fmt.Fprintf(buf, "packetSchemas[id] = resolved\n")
	fmt.Fprintf(buf, "}\n\n")

	fmt.Fprintf(buf, "func generatedSchemaLoader(uri *url.URL) (*jsonschema.Schema, error) {\n")
	fmt.Fprintf(buf, "key := uri.Path\n")
	fmt.Fprintf(buf, "if len(key) > 0 && key[0] == '/' { key = key[1:] }\n")
	fmt.Fprintf(buf, "raw, ok := generatedSchemaSources[key]\n")
	fmt.Fprintf(buf, "if !ok { raw, ok = generatedSchemaSources[uri.String()] }\n")
	fmt.Fprintf(buf, "if !ok { return nil, fmt.Errorf(\"schema %%q is not embedded\", uri.String()) }\n")
	fmt.Fprintf(buf, "var schema jsonschema.Schema\n")
	fmt.Fprintf(buf, "if err := json.Unmarshal([]byte(raw), &schema); err != nil { return nil, err }\n")
	fmt.Fprintf(buf, "return &schema, nil\n")
	fmt.Fprintf(buf, "}\n\n")

	fmt.Fprintf(buf, "func ValidatePacketData(id PacketID, data json.RawMessage) error {\n")
	fmt.Fprintf(buf, "schema, ok := packetSchemas[id]\n")
	fmt.Fprintf(buf, "if !ok { return fmt.Errorf(\"unknown packet id %%q\", id) }\n")
	fmt.Fprintf(buf, "if len(data) == 0 { data = json.RawMessage(`{}`) }\n")
	fmt.Fprintf(buf, "var value any\n")
	fmt.Fprintf(buf, "if err := json.Unmarshal(data, &value); err != nil { return err }\n")
	fmt.Fprintf(buf, "return schema.Validate(value)\n")
	fmt.Fprintf(buf, "}\n\n")
}

func writeDecodeEncode(buf *bytes.Buffer, packets []packet) {
	writeDecode(buf, "Serverbound", "serverbound", packets)
	writeDecode(buf, "Clientbound", "clientbound", packets)
	writeEncode(buf, "Serverbound", "serverbound", packets)
	writeEncode(buf, "Clientbound", "clientbound", packets)

	fmt.Fprintf(buf, "func decodePacketData[T any](id PacketID, data json.RawMessage) (T, error) {\n")
	fmt.Fprintf(buf, "var payload T\n")
	fmt.Fprintf(buf, "if len(data) == 0 { data = json.RawMessage(`{}`) }\n")
	fmt.Fprintf(buf, "if err := ValidatePacketData(id, data); err != nil { return payload, err }\n")
	fmt.Fprintf(buf, "if err := json.Unmarshal(data, &payload); err != nil { return payload, err }\n")
	fmt.Fprintf(buf, "return payload, nil\n")
	fmt.Fprintf(buf, "}\n\n")

	fmt.Fprintf(buf, "func encodeEnvelope(id PacketID, payload any) ([]byte, error) {\n")
	fmt.Fprintf(buf, "data, err := json.Marshal(payload)\n")
	fmt.Fprintf(buf, "if err != nil { return nil, err }\n")
	fmt.Fprintf(buf, "if err := ValidatePacketData(id, data); err != nil { return nil, err }\n")
	fmt.Fprintf(buf, "return json.Marshal(Envelope{ID: id, Data: data})\n")
	fmt.Fprintf(buf, "}\n\n")
}

func writeDecode(buf *bytes.Buffer, label string, direction string, packets []packet) {
	fmt.Fprintf(buf, "func Decode%s(data []byte) (%sPacket, error) {\n", label, label)
	fmt.Fprintf(buf, "var envelope Envelope\n")
	fmt.Fprintf(buf, "if err := json.Unmarshal(data, &envelope); err != nil { return nil, err }\n")
	fmt.Fprintf(buf, "switch envelope.ID {\n")
	for _, packet := range packets {
		if packet.Spec.Direction != direction {
			continue
		}
		fmt.Fprintf(buf, "case %s:\n", packetIDConst(packet))
		fmt.Fprintf(buf, "payload, err := decodePacketData[%s](envelope.ID, envelope.Data)\n", packet.Spec.TypeName)
		fmt.Fprintf(buf, "if err != nil { return nil, err }\n")
		fmt.Fprintf(buf, "return %sPacket{Data: payload}, nil\n", packet.Spec.TypeName)
	}
	fmt.Fprintf(buf, "default:\n")
	fmt.Fprintf(buf, "return nil, fmt.Errorf(\"unknown %s packet id %%q\", envelope.ID)\n", direction)
	fmt.Fprintf(buf, "}\n")
	fmt.Fprintf(buf, "}\n\n")
}

func writeEncode(buf *bytes.Buffer, label string, direction string, packets []packet) {
	fmt.Fprintf(buf, "func Encode%s(packet %sPacket) ([]byte, error) {\n", label, label)
	fmt.Fprintf(buf, "switch p := packet.(type) {\n")
	for _, packet := range packets {
		if packet.Spec.Direction != direction {
			continue
		}
		fmt.Fprintf(buf, "case %sPacket:\n", packet.Spec.TypeName)
		fmt.Fprintf(buf, "return encodeEnvelope(%s, p.Data)\n", packetIDConst(packet))
		fmt.Fprintf(buf, "case *%sPacket:\n", packet.Spec.TypeName)
		fmt.Fprintf(buf, "return encodeEnvelope(%s, p.Data)\n", packetIDConst(packet))
	}
	fmt.Fprintf(buf, "default:\n")
	fmt.Fprintf(buf, "return nil, fmt.Errorf(\"unsupported %s packet type %%T\", packet)\n", direction)
	fmt.Fprintf(buf, "}\n")
	fmt.Fprintf(buf, "}\n\n")
}

func generateCSharp(packets []packet) ([]byte, error) {
	for _, packet := range packets {
		for _, enum := range packet.Enums {
			for _, value := range enum.Values {
				if _, err := csharpEnumMember(value.Value); err != nil {
					return nil, fmt.Errorf("generate C# enum %s: %w", enum.Name, err)
				}
			}
		}
	}

	var buf bytes.Buffer
	fmt.Fprintln(&buf, "// <auto-generated>")
	fmt.Fprintln(&buf, "// Generated by backend/cmd/protocolgen. DO NOT EDIT.")
	fmt.Fprintln(&buf, "// </auto-generated>")
	fmt.Fprintln(&buf, "#nullable enable")
	fmt.Fprintln(&buf)
	fmt.Fprintln(&buf, "using System;")
	fmt.Fprintln(&buf, "using System.Text.Json;")
	fmt.Fprintln(&buf, "using System.Text.Json.Serialization;")
	fmt.Fprintln(&buf)
	fmt.Fprintln(&buf, "namespace Echoform.Protocol;")
	fmt.Fprintln(&buf)

	writeCSharpHeaderTypes(&buf, packets)
	writeCSharpPayloadTypes(&buf, packets)
	writeCSharpPacketTypes(&buf, packets)
	writeCSharpCodec(&buf, packets)

	return buf.Bytes(), nil
}

func writeCSharpHeaderTypes(buf *bytes.Buffer, packets []packet) {
	fmt.Fprintln(buf, "public static class PacketIds")
	fmt.Fprintln(buf, "{")
	for _, packet := range packets {
		fmt.Fprintf(buf, "    public const string %s = %q;\n", packet.Spec.TypeName, packet.Spec.ID)
	}
	fmt.Fprintln(buf, "}")
	fmt.Fprintln(buf)

	fmt.Fprintln(buf, "public interface IPacket")
	fmt.Fprintln(buf, "{")
	fmt.Fprintln(buf, "    string Id { get; }")
	fmt.Fprintln(buf, "}")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "public interface IServerboundPacket : IPacket")
	fmt.Fprintln(buf, "{")
	fmt.Fprintln(buf, "}")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "public interface IClientboundPacket : IPacket")
	fmt.Fprintln(buf, "{")
	fmt.Fprintln(buf, "    void Dispatch(IClientboundPacketHandler handler);")
	fmt.Fprintln(buf, "}")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "public interface IClientboundPacketHandler")
	fmt.Fprintln(buf, "{")
	for _, packet := range packets {
		if packet.Spec.Direction == "clientbound" {
			fmt.Fprintf(buf, "    void Handle(%sPacket packet);\n", packet.Spec.TypeName)
		}
	}
	fmt.Fprintln(buf, "}")
	fmt.Fprintln(buf)
}

func writeCSharpPayloadTypes(buf *bytes.Buffer, packets []packet) {
	for _, packet := range packets {
		for _, enum := range packet.Enums {
			fmt.Fprintf(buf, "[JsonConverter(typeof(JsonStringEnumConverter<%s>))]\n", enum.Name)
			fmt.Fprintf(buf, "public enum %s\n", enum.Name)
			fmt.Fprintln(buf, "{")
			for _, value := range enum.Values {
				member, _ := csharpEnumMember(value.Value)
				fmt.Fprintf(buf, "    %s,\n", member)
			}
			fmt.Fprintln(buf, "}")
			fmt.Fprintln(buf)
		}

		fmt.Fprintf(buf, "public sealed class %s\n", packet.Spec.TypeName)
		fmt.Fprintln(buf, "{")
		for _, field := range packet.Fields {
			fieldType := field.CSharpType
			if !field.Required && !strings.HasSuffix(fieldType, "?") {
				fieldType += "?"
			}
			required := ""
			if field.Required {
				required = "required "
			}
			fmt.Fprintf(buf, "    [JsonPropertyName(%q)]\n", field.JSONName)
			fmt.Fprintf(buf, "    public %s%s %s { get; init; }\n", required, fieldType, field.Name)
		}
		fmt.Fprintln(buf, "}")
		fmt.Fprintln(buf)
	}
}

func writeCSharpPacketTypes(buf *bytes.Buffer, packets []packet) {
	for _, packet := range packets {
		packetType := packet.Spec.TypeName + "Packet"
		packetInterface := "IServerboundPacket"
		if packet.Spec.Direction == "clientbound" {
			packetInterface = "IClientboundPacket"
		}

		fmt.Fprintf(buf, "public sealed class %s : %s\n", packetType, packetInterface)
		fmt.Fprintln(buf, "{")
		fmt.Fprintf(buf, "    public %s(%s data)\n", packetType, packet.Spec.TypeName)
		fmt.Fprintln(buf, "    {")
		fmt.Fprintln(buf, "        Data = data;")
		fmt.Fprintln(buf, "    }")
		fmt.Fprintln(buf)
		fmt.Fprintf(buf, "    public string Id => PacketIds.%s;\n", packet.Spec.TypeName)
		fmt.Fprintf(buf, "    public %s Data { get; }\n", packet.Spec.TypeName)
		if packet.Spec.Direction == "clientbound" {
			fmt.Fprintln(buf)
			fmt.Fprintln(buf, "    public void Dispatch(IClientboundPacketHandler handler)")
			fmt.Fprintln(buf, "    {")
			fmt.Fprintln(buf, "        handler.Handle(this);")
			fmt.Fprintln(buf, "    }")
		}
		fmt.Fprintln(buf, "}")
		fmt.Fprintln(buf)
	}
}

func writeCSharpCodec(buf *bytes.Buffer, packets []packet) {
	fmt.Fprintln(buf, "public static class ProtocolCodec")
	fmt.Fprintln(buf, "{")
	fmt.Fprintln(buf, "    private static readonly JsonSerializerOptions Options = new()")
	fmt.Fprintln(buf, "    {")
	fmt.Fprintln(buf, "        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,")
	fmt.Fprintln(buf, "    };")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "    public static string EncodeServerbound(IServerboundPacket packet)")
	fmt.Fprintln(buf, "    {")
	fmt.Fprintln(buf, "        return packet switch")
	fmt.Fprintln(buf, "        {")
	for _, packet := range packets {
		if packet.Spec.Direction == "serverbound" {
			fmt.Fprintf(buf, "            %sPacket value => SerializeEnvelope(value.Id, value.Data),\n", packet.Spec.TypeName)
		}
	}
	fmt.Fprintln(buf, "            _ => throw new ArgumentOutOfRangeException(nameof(packet), packet.GetType(), \"Unsupported serverbound packet type.\"),")
	fmt.Fprintln(buf, "        };")
	fmt.Fprintln(buf, "    }")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "    public static IClientboundPacket DecodeClientbound(string json)")
	fmt.Fprintln(buf, "    {")
	fmt.Fprintln(buf, "        using var document = JsonDocument.Parse(json);")
	fmt.Fprintln(buf, "        var root = document.RootElement;")
	fmt.Fprintln(buf, "        if (root.ValueKind != JsonValueKind.Object ||")
	fmt.Fprintln(buf, "            !root.TryGetProperty(\"id\", out var idElement) ||")
	fmt.Fprintln(buf, "            idElement.ValueKind != JsonValueKind.String)")
	fmt.Fprintln(buf, "        {")
	fmt.Fprintln(buf, "            throw new JsonException(\"Packet must be an object with a string id.\");")
	fmt.Fprintln(buf, "        }")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "        var id = idElement.GetString();")
	fmt.Fprintln(buf, "        var dataJson = root.TryGetProperty(\"data\", out var dataElement)")
	fmt.Fprintln(buf, "            ? dataElement.GetRawText()")
	fmt.Fprintln(buf, "            : \"{}\";")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "        return id switch")
	fmt.Fprintln(buf, "        {")
	for _, packet := range packets {
		if packet.Spec.Direction == "clientbound" {
			fmt.Fprintf(buf, "            PacketIds.%s => new %sPacket(DeserializeData<%s>(dataJson)),\n", packet.Spec.TypeName, packet.Spec.TypeName, packet.Spec.TypeName)
		}
	}
	fmt.Fprintln(buf, "            _ => throw new JsonException($\"Unknown clientbound packet id '{id}'.\"),")
	fmt.Fprintln(buf, "        };")
	fmt.Fprintln(buf, "    }")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "    private static string SerializeEnvelope<T>(string id, T data)")
	fmt.Fprintln(buf, "    {")
	fmt.Fprintln(buf, "        return JsonSerializer.Serialize(new Envelope<T> { Id = id, Data = data }, Options);")
	fmt.Fprintln(buf, "    }")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "    private static T DeserializeData<T>(string json)")
	fmt.Fprintln(buf, "    {")
	fmt.Fprintln(buf, "        return JsonSerializer.Deserialize<T>(json, Options)")
	fmt.Fprintln(buf, "            ?? throw new JsonException($\"Packet data for {typeof(T).Name} was null.\");")
	fmt.Fprintln(buf, "    }")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "    private sealed class Envelope<T>")
	fmt.Fprintln(buf, "    {")
	fmt.Fprintln(buf, "        [JsonPropertyName(\"id\")]")
	fmt.Fprintln(buf, "        public required string Id { get; init; }")
	fmt.Fprintln(buf)
	fmt.Fprintln(buf, "        [JsonPropertyName(\"data\")]")
	fmt.Fprintln(buf, "        public required T Data { get; init; }")
	fmt.Fprintln(buf, "    }")
	fmt.Fprintln(buf, "}")
}

func csharpTypeFromGoType(goType string) string {
	nullable := strings.HasPrefix(goType, "*")
	goType = strings.TrimPrefix(goType, "*")

	isArray := strings.HasPrefix(goType, "[]")
	goType = strings.TrimPrefix(goType, "[]")

	csharpType := goType
	switch goType {
	case "string":
		csharpType = "string"
	case "bool":
		csharpType = "bool"
	case "int64":
		csharpType = "long"
	case "float64":
		csharpType = "double"
	}

	if isArray {
		csharpType += "[]"
	}
	if nullable {
		csharpType += "?"
	}
	return csharpType
}

func csharpEnumMember(value string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("enum value must not be empty")
	}
	for index, r := range value {
		if index == 0 {
			if !(unicode.IsLetter(r) || r == '_') {
				return "", fmt.Errorf("enum value %q is not a valid C# identifier", value)
			}
			continue
		}
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_') {
			return "", fmt.Errorf("enum value %q is not a valid C# identifier", value)
		}
	}

	if csharpKeywords[value] {
		return "@" + value, nil
	}
	return value, nil
}

var csharpKeywords = map[string]bool{
	"abstract": true, "as": true, "base": true, "bool": true, "break": true,
	"byte": true, "case": true, "catch": true, "char": true, "checked": true,
	"class": true, "const": true, "continue": true, "decimal": true, "default": true,
	"delegate": true, "do": true, "double": true, "else": true, "enum": true,
	"event": true, "explicit": true, "extern": true, "false": true, "finally": true,
	"fixed": true, "float": true, "for": true, "foreach": true, "goto": true,
	"if": true, "implicit": true, "in": true, "int": true, "interface": true,
	"internal": true, "is": true, "lock": true, "long": true, "namespace": true,
	"new": true, "null": true, "object": true, "operator": true, "out": true,
	"override": true, "params": true, "private": true, "protected": true, "public": true,
	"readonly": true, "ref": true, "return": true, "sbyte": true, "sealed": true,
	"short": true, "sizeof": true, "stackalloc": true, "static": true, "string": true,
	"struct": true, "switch": true, "this": true, "throw": true, "true": true,
	"try": true, "typeof": true, "uint": true, "ulong": true, "unchecked": true,
	"unsafe": true, "ushort": true, "using": true, "virtual": true, "void": true,
	"volatile": true, "while": true,
}

func schemaType(schema *jsonschema.Schema) string {
	if schema.Type != "" {
		return schema.Type
	}
	if len(schema.Types) == 1 {
		return schema.Types[0]
	}
	return ""
}

func packetIDConst(packet packet) string {
	return "PacketID" + exportedName(packet.Spec.ID)
}

func exportedName(value string) string {
	parts := identifierParts(value)
	var out strings.Builder
	for _, part := range parts {
		if part == "" {
			continue
		}
		out.WriteString(exportedPart(part))
	}

	if out.Len() == 0 {
		return "Value"
	}

	name := out.String()
	first := []rune(name)[0]
	if unicode.IsDigit(first) {
		return "Value" + name
	}
	return name
}

func identifierParts(value string) []string {
	var parts []string
	var current []rune
	var previous rune

	flush := func() {
		if len(current) == 0 {
			return
		}
		parts = append(parts, string(current))
		current = nil
	}

	for _, r := range value {
		if !(unicode.IsLetter(r) || unicode.IsDigit(r)) {
			flush()
			previous = 0
			continue
		}

		if len(current) > 0 && unicode.IsUpper(r) && (unicode.IsLower(previous) || unicode.IsDigit(previous)) {
			flush()
		}

		current = append(current, r)
		previous = r
	}
	flush()

	return parts
}

func exportedPart(value string) string {
	if value == "" {
		return ""
	}

	allUpper := true
	for _, r := range value {
		if unicode.IsLetter(r) && !unicode.IsUpper(r) {
			allUpper = false
			break
		}
	}

	if allUpper {
		value = strings.ToLower(value)
	}

	runes := []rune(value)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

func isExportedIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for i, r := range value {
		if i == 0 {
			if !unicode.IsUpper(r) || !(unicode.IsLetter(r) || r == '_') {
				return false
			}
			continue
		}
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_') {
			return false
		}
	}
	return true
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
