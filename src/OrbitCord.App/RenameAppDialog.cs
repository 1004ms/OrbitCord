using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace OrbitCord.App;

internal sealed class RenameAppDialog : Window
{
    private readonly TextBox _nameBox;

    public string AppName => _nameBox.Text;

    public RenameAppDialog(string currentName)
    {
        Title = "Rinomina app";
        Width = 420;
        Height = 165;
        MinWidth = 420;
        MinHeight = 165;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        var grid = new Grid { Margin = new Thickness(18) };
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(14) });
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        _nameBox = new TextBox
        {
            Text = currentName,
            MaxLength = IconCustomizationStore.MaxCustomAppNameLength,
            FontSize = 15,
            Padding = new Thickness(10, 7, 10, 7)
        };
        _nameBox.SelectAll();
        Grid.SetRow(_nameBox, 0);
        grid.Children.Add(_nameBox);

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right
        };
        var cancel = new Button { Content = "Annulla", MinWidth = 88, Margin = new Thickness(0, 0, 8, 0), IsCancel = true };
        var save = new Button { Content = "Salva", MinWidth = 88, IsDefault = true };
        save.Click += (_, _) => DialogResult = true;
        buttons.Children.Add(cancel);
        buttons.Children.Add(save);
        Grid.SetRow(buttons, 2);
        grid.Children.Add(buttons);

        Content = grid;
        Loaded += (_, _) => _nameBox.Focus();
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key != Key.Enter) return;
            e.Handled = true;
            DialogResult = true;
        };
    }
}
