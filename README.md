# gradle-importer

This is an ADO pipeline that will traverse all repos, reading gradle files and updating the corresponding entities in Port with the listed plugins.


## Blueprint changes

You will need to add a new JSON property named `plugins` to your repository blueprint

```
{
  ...
  "properties": {
    ...
    "plugins": {
      "type": "object",
      "title": "Plugins"
    }
    ...
  }
  ...
}
```

## Configure your azure devops pipeline

```
ADO_ORG=
ADO_PAT=
PORT_CLIENT_ID=
PORT_CLIENT_SECRET=
PORT_BLUEPRINT=azureDevopsRepository ## Set to whatever your ADO Repo blueprint id is
```