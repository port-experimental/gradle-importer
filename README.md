# gradle-importer

This is a Port Automation backend that can parse gradle file contents, parse out relevant data and write back to the source entity.


## Sample Automation

```
{
  "identifier": "parse_gradle_file",
  "title": "Parse Gradle File",
  "description": "Parses a Gradle File",
  "trigger": {
    "type": "automation",
    "event": {
      "type": "ANY_ENTITY_CHANGE",
      "blueprintIdentifier": "repository"
    },
    "condition":{
      "type": "JQ",
      "expressions": [".diff.before.properties.gradle_file != .diff.after.properties.gradle_file",
        ".diff.after.properties.gradle_file != null"],
      "combinator": "and"
    }
  },
  "invocationMethod": {
    "type": "GITHUB",
    "org": "port-experimental",
    "repo": "gradle-importer",
    "workflow": "parse_gradle.yml",
    "reportWorkflowStatus": true,
    "workflowInputs": {
      "gradle_file": "{{ .event.diff.after.properties.gradle_file }}",
      "blueprint": "{{ .event.diff.after.blueprint }}",
      "idenfifier": "{{ .event.diff.after.identifier }}",
      "run_id": "{{ .run.id }}"
    }
  },
  "publish": true
}
```